/**
 * Tests del generador de fixtures relativas.
 *
 * Un generador de fixtures sin tests es peor que no tenerlo: produce feeds que
 * el parser acepta, los tests que lo consumen salen verdes, y nadie descubre
 * que las fechas estaban corridas o que el plegado partía el código de reserva.
 * Estas aserciones son el control de que la entrada de los tests de la fase es
 * la que dice ser.
 */
import { describe, expect, it } from 'vitest';

import { codigosDe, feedConCheckoutRelativo } from './generar';

const desdoblar = (ics: string) => ics.replace(/\n /g, '');
const octetos = (linea: string) => new TextEncoder().encode(linea).length;

describe('feedConCheckoutRelativo', () => {
  it('coloca cada DTEND en el día pedido, incluido el offset 0 (la reserva que termina HOY)', () => {
    const ics = feedConCheckoutRelativo([0, 3, -1], '2026-09-02');

    expect(ics).toContain('DTEND;VALUE=DATE:20260902');
    expect(ics).toContain('DTEND;VALUE=DATE:20260905');
    expect(ics).toContain('DTEND;VALUE=DATE:20260901');
  });

  it('el DTSTART queda a las noches pedidas por detrás del DTEND', () => {
    expect(feedConCheckoutRelativo([0], '2026-09-02')).toContain('DTSTART;VALUE=DATE:20260831');
    expect(feedConCheckoutRelativo([0], '2026-09-02', { noches: 5 })).toContain(
      'DTSTART;VALUE=DATE:20260828',
    );
  });

  it('emite un VEVENT por offset', () => {
    const ics = feedConCheckoutRelativo([-2, -1, 0, 1, 2], '2026-09-02');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
  });

  it('cruza fin de mes, fin de año y 29 de febrero sin desplazarse', () => {
    expect(feedConCheckoutRelativo([1], '2026-09-30')).toContain('DTEND;VALUE=DATE:20261001');
    expect(feedConCheckoutRelativo([1], '2026-12-31')).toContain('DTEND;VALUE=DATE:20270101');
    expect(feedConCheckoutRelativo([1], '2028-02-28')).toContain('DTEND;VALUE=DATE:20280229');
    expect(feedConCheckoutRelativo([1], '2026-02-28')).toContain('DTEND;VALUE=DATE:20260301');
  });

  it('cada reserva lleva un código distinto, alcanzable tras desdoblar', () => {
    const offsets = [0, 1, 2, 3, 4, 5];
    const ics = desdoblar(feedConCheckoutRelativo(offsets, '2026-09-02'));
    const codigos = codigosDe(offsets);

    expect(new Set(codigos).size).toBe(offsets.length);
    for (const codigo of codigos) {
      expect(ics).toContain(`reservations/details/${codigo}`);
    }
  });

  it('pliega a 75 octetos con continuación por espacio, como el feed real', () => {
    const ics = feedConCheckoutRelativo([0], '2026-09-02');
    const largos = ics.split('\n').map(octetos);

    // Ninguna línea excede el límite…
    expect(Math.max(...largos)).toBeLessThanOrEqual(75);
    // …y alguna lo alcanza: si ninguna llegara a 75, el plegado no se estaría
    // ejerciendo y este test pasaría por vacuidad, que es justo lo que las
    // fixtures del repo existen para atrapar.
    expect(Math.max(...largos)).toBe(75);
    expect(ics).toMatch(/\n [a-z]/);
  });

  it('incluye los últimos 4 dígitos del teléfono a propósito: es lo que el normalizador debe descartar', () => {
    const ics = desdoblar(feedConCheckoutRelativo([0], '2026-09-02', { telefono: '9911' }));
    expect(ics).toContain('Phone Number (Last 4 Digits): 9911');
  });

  it('rechaza un día de referencia que no sea YYYY-MM-DD', () => {
    expect(() => feedConCheckoutRelativo([0], '02/09/2026')).toThrow(/YYYY-MM-DD/);
    expect(() => feedConCheckoutRelativo([0], '2026-9-2')).toThrow(/YYYY-MM-DD/);
  });

  it('rechaza un número de noches que no dejaría DTEND > DTSTART', () => {
    expect(() => feedConCheckoutRelativo([0], '2026-09-02', { noches: 0 })).toThrow(/noches/);
  });

  it('abre y cierra el calendario', () => {
    const ics = feedConCheckoutRelativo([0], '2026-09-02');
    expect(ics.startsWith('BEGIN:VCALENDAR\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\n')).toBe(true);
  });
});
