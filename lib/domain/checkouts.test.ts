import { describe, expect, test } from 'vitest';

import { checkoutsDelMes, distanciaHastaCheckout, proximoCheckout } from './checkouts';
import { TZ_BOGOTA } from './constants';
import { formatFechaLargaBog } from './dates';

/**
 * EL CONTRATO DE LA ARITMÉTICA DE CHECKOUTS. ESCRITO ANTES QUE SU IMPLEMENTACIÓN.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO A PROPÓSITO. `lib/domain/checkouts.ts` todavía no
 * existe; se escribe contra estas aserciones. Un verde aquí hoy significaría
 * que el test no mide nada.
 *
 * ── QUÉ SE ESTÁ PROTEGIENDO ───────────────────────────────────────────────
 *
 * `calendar_reservations.ends_on` es un `date`: un DÍA CALENDARIO DE NEGOCIO,
 * no un instante. El defecto clásico de este repo es convertirlo a un tipo
 * temporal desde la cadena entera, porque eso lo fija en medianoche UTC y en
 * Bogotá (UTC-5) el 4 de septiembre se pinta como 3. El último bloque de este
 * archivo MIDE ese defecto en vez de describirlo, y comprueba que el camino de
 * este módulo no lo tiene.
 *
 * El CI corre con `TZ=UTC` (vitest.config.ts), así que el desfase no aparece
 * solo: hay que forzarlo con un formateador anclado en la zona de negocio. Por
 * eso el caso del 4 de septiembre lleva las dos mitades.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los checkouts de septiembre del apartamento del ejemplo de UI-SPEC §8.1. */
const SEPTIEMBRE = ['2026-09-04', '2026-09-09', '2026-09-18', '2026-09-28'];

describe('proximoCheckout', () => {
  test('sin checkouts devuelve null, no una fecha inventada', () => {
    expect(proximoCheckout([], '2026-09-17')).toBeNull();
  });

  test('devuelve el primero que viene, no el primero de la lista', () => {
    expect(proximoCheckout(SEPTIEMBRE, '2026-09-17')).toBe('2026-09-18');
  });

  test('si hoy ES un checkout, hoy es el próximo: el mayor o igual incluye el igual', () => {
    // El aseo de hoy es justamente el que el admin está mirando. Saltárselo
    // pondría el panel a hablar del de la semana que viene.
    expect(proximoCheckout(SEPTIEMBRE, '2026-09-18')).toBe('2026-09-18');
  });

  test('con la lista desordenada devuelve lo mismo que con la lista ordenada', () => {
    // La lectura trae `order by ends_on`, pero el módulo no depende de eso: si
    // dependiera, un `select` sin `order` daría un panel silenciosamente falso.
    const desordenada = ['2026-09-28', '2026-09-04', '2026-09-18', '2026-09-09'];
    expect(proximoCheckout(desordenada, '2026-09-17')).toBe(
      proximoCheckout(SEPTIEMBRE, '2026-09-17'),
    );
  });

  test('si todos los checkouts quedaron atrás devuelve null', () => {
    expect(proximoCheckout(SEPTIEMBRE, '2026-09-29')).toBeNull();
  });

  test('cruza el año sin tropezar: enero viene después de diciembre', () => {
    expect(proximoCheckout(['2027-01-03', '2026-12-31'], '2026-12-31')).toBe('2026-12-31');
    expect(proximoCheckout(['2027-01-03', '2026-12-31'], '2027-01-01')).toBe('2027-01-03');
  });
});

describe('checkoutsDelMes', () => {
  test('se queda con el mes pedido y descarta los vecinos', () => {
    const fechas = ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01'];
    expect(checkoutsDelMes(fechas, '2026-09')).toEqual(['2026-09-01', '2026-09-30']);
  });

  test('un mes sin checkouts devuelve la lista vacía, no null', () => {
    // El componente pinta el vacío de §15.2 con un `length === 0`. Un `null`
    // aquí obligaría a que además comprobara la ausencia, que es la segunda
    // verdad que este módulo existe para no crear.
    expect(checkoutsDelMes(SEPTIEMBRE, '2026-10')).toEqual([]);
  });

  test('devuelve las fechas ordenadas aunque lleguen desordenadas', () => {
    const desordenada = ['2026-09-28', '2026-09-04', '2026-09-18', '2026-09-09'];
    expect(checkoutsDelMes(desordenada, '2026-09')).toEqual(SEPTIEMBRE);
  });

  test('el cruce de año: diciembre no se lleva la del 1 de enero', () => {
    // Con un filtro escrito como "empieza por 2026-12" esto pasa igual, pero
    // con uno escrito como "está entre el primero y el último" y aritmética a
    // mano, enero se cuela. Por eso el caso está escrito.
    const fechas = ['2026-12-01', '2026-12-31', '2027-01-01'];
    expect(checkoutsDelMes(fechas, '2026-12')).toEqual(['2026-12-01', '2026-12-31']);
  });
});

describe('distanciaHastaCheckout', () => {
  test('el checkout de hoy da la clave de hoy, con cero días', () => {
    expect(distanciaHastaCheckout('2026-09-17', '2026-09-17')).toEqual({
      clave: 'hoy',
      dias: 0,
    });
  });

  test('el de mañana tiene clave propia: no es "dentro de 1 día"', () => {
    expect(distanciaHastaCheckout('2026-09-18', '2026-09-17')).toEqual({
      clave: 'manana',
      dias: 1,
    });
  });

  test('de ahí en adelante, la clave de días con el número', () => {
    expect(distanciaHastaCheckout('2026-09-20', '2026-09-17')).toEqual({
      clave: 'en-dias',
      dias: 3,
    });
  });

  test('cruzar el mes no altera la cuenta', () => {
    // Del 30 de septiembre al 2 de octubre son dos días. Restar los números de
    // día a pelo (2 - 30) da -28.
    expect(distanciaHastaCheckout('2026-10-02', '2026-09-30')).toEqual({
      clave: 'en-dias',
      dias: 2,
    });
  });

  test('el 29 de febrero cuenta: en bisiesto, del 28 al 1 de marzo hay dos días', () => {
    // Los dos años juntos, porque es la pareja la que mide algo. En 2027 el 1
    // de marzo es MAÑANA del 28 de febrero; en 2028 no, porque existe el 29.
    // Una implementación que trate febrero como de 28 días fijos pasa el
    // primero y falla el segundo.
    expect(distanciaHastaCheckout('2027-03-01', '2027-02-28')).toEqual({
      clave: 'manana',
      dias: 1,
    });
    expect(distanciaHastaCheckout('2028-03-01', '2028-02-28')).toEqual({
      clave: 'en-dias',
      dias: 2,
    });
  });

  test('un checkout que ya pasó no se rotula: se lanza', () => {
    // Por construcción no puede llegar: lo único que se le pasa es la salida de
    // `proximoCheckout`, que nunca devuelve una fecha anterior a hoy. Si llega,
    // el rótulo honesto no existe, y `dentro de -2 días` es una mentira en la
    // pantalla del admin. Misma decisión que `estadoDeAseo()` con un aseo
    // gestionado sin estado.
    expect(() => distanciaHastaCheckout('2026-09-15', '2026-09-17')).toThrow(
      /anterior a hoy/,
    );
  });
});

describe('el día calendario sobrevive el viaje, que es la razón del módulo', () => {
  /**
   * El formateador que NO usa el repo, montado aquí a propósito para medir el
   * defecto. Es el mismo `Intl` de `lib/domain/dates.ts` pero anclado en la
   * zona de negocio en vez de en UTC, que es lo que hace visible el desfase.
   */
  const EN_BOGOTA = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    timeZone: TZ_BOGOTA,
  });

  test('el defecto es real: la cadena convertida a instante se lee como el día anterior', () => {
    // MEDIDO, y por eso está escrito como aserción: `new Date('2026-09-04')` es
    // medianoche UTC, y en Bogotá eso son las 19:00 del día 3.
    expect(EN_BOGOTA.format(new Date('2026-09-04'))).toBe('3 de septiembre');
  });

  test('el 4 de septiembre sigue siendo el 4 después de pasar por este módulo', () => {
    const proximo = proximoCheckout(SEPTIEMBRE, '2026-09-01');
    expect(proximo).not.toBeNull();
    // La aserción es sobre el TEXTO FORMATEADO, no sobre la cadena de entrada:
    // comparar `'2026-09-04'` consigo mismo no mediría nada del defecto.
    expect(formatFechaLargaBog(proximo as string)).toBe('4 de septiembre');
  });

  test('los checkouts del mes también: el primero de la lista se lee como el 4', () => {
    const [primero] = checkoutsDelMes(SEPTIEMBRE, '2026-09');
    expect(formatFechaLargaBog(primero)).toBe('4 de septiembre');
  });
});
