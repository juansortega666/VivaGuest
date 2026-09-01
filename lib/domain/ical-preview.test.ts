import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { desdoblar, previsualizarIcs } from './ical-preview';

/** Se lee el `.ics` crudo del disco: el plegado y los CRLF son parte del caso. */
const fixture = (nombre: string) =>
  readFileSync(new URL(`./__fixtures__/ical/${nombre}`, import.meta.url), 'utf8');

/**
 * Fecha fija. El resultado no puede depender del día en que corra el test, y con
 * `TZ=UTC` (vitest.config.ts) un off-by-one de `DTEND` no se puede esconder.
 */
const HOY = '2026-09-01';

describe('desdoblar (RFC 5545 §3.1)', () => {
  it('normaliza CRLF a LF', () => {
    expect(desdoblar('A:1\r\nB:2\r\n')).toBe('A:1\nB:2\n');
  });

  it('une la continuación marcada con un espacio', () => {
    expect(desdoblar('DESCRIPTION:abc\r\n def')).toBe('DESCRIPTION:abcdef');
  });

  it('une la continuación marcada con un tabulador', () => {
    expect(desdoblar('DESCRIPTION:abc\r\n\tdef')).toBe('DESCRIPTION:abcdef');
  });

  it('no une líneas que no son continuación', () => {
    expect(desdoblar('A:1\r\nB:2')).toBe('A:1\nB:2');
  });

  it('reconstruye entero el código de reserva partido a 75 octetos', () => {
    const texto = desdoblar(fixture('folded.ics'));
    expect(texto).toContain(
      'https://www.airbnb.com/hosting/reservations/details/HMYXB825YD',
    );
  });
});

describe('previsualizarIcs — sniff de contenido', () => {
  it('distingue un HTTP 200 con HTML de un calendario', () => {
    expect(previsualizarIcs(fixture('html-200.html'), HOY)).toEqual({
      ok: false,
      motivo: 'no-es-ical',
    });
  });

  it('no confunde el HTML de error con un calendario vacío', () => {
    // Son DOS estados de UI distintos (UI-SPEC §10.3, estados 5 y 6).
    // Confundirlos es cómo un admin guarda un link roto creyendo que sirve.
    const html = previsualizarIcs(fixture('html-200.html'), HOY);
    const vacio = previsualizarIcs(fixture('vacio.ics'), HOY);
    expect(html.ok).toBe(false);
    expect(vacio.ok).toBe(true);
  });

  it('un cuerpo vacío tampoco es un calendario', () => {
    expect(previsualizarIcs('', HOY)).toEqual({ ok: false, motivo: 'no-es-ical' });
  });
});

describe('previsualizarIcs — caso feliz', () => {
  it('cuenta 2 reservas, 1 bloqueo y da el próximo checkout y el DTSTAMP', () => {
    expect(previsualizarIcs(fixture('feliz.ics'), HOY)).toEqual({
      ok: true,
      totalEventos: 3,
      reservas: 2,
      bloqueos: 1,
      proximoCheckout: '2026-09-04',
      dtstamp: '20260901T120000Z',
    });
  });

  it('devuelve el DTEND tal cual: una reserva de una noche 0903→0904 sale el 0904', () => {
    // `DTEND` es exclusivo y ES el día del aseo. Ni se le suma ni se le resta un día.
    const r = previsualizarIcs(fixture('feliz.ics'), HOY);
    expect(r.ok && r.proximoCheckout).toBe('2026-09-04');
  });

  it('cuenta la reserva cuyo checkout es HOY: un checkout de hoy sigue siendo un checkout', () => {
    const r = previsualizarIcs(fixture('feliz.ics'), '2026-09-04');
    expect(r.ok && r.proximoCheckout).toBe('2026-09-04');
  });

  it('salta a la siguiente fecha cuando el primer checkout ya pasó', () => {
    const r = previsualizarIcs(fixture('feliz.ics'), '2026-09-05');
    expect(r.ok && r.proximoCheckout).toBe('2026-09-15');
  });
});

describe('previsualizarIcs — calendario válido sin eventos', () => {
  it('un VCALENDAR sin VEVENT es válido y vacío, no un error', () => {
    expect(previsualizarIcs(fixture('vacio.ics'), HOY)).toEqual({
      ok: true,
      totalEventos: 0,
      reservas: 0,
      bloqueos: 0,
      proximoCheckout: null,
      dtstamp: '20260901T120000Z',
    });
  });
});

describe('previsualizarIcs — clasificación reserva vs bloqueo', () => {
  it('un feed de puros bloqueos da 0 reservas y NO es un error', () => {
    const r = previsualizarIcs(fixture('solo-bloqueos.ics'), HOY);
    expect(r.ok).toBe(true);
    expect(r.ok && r.reservas).toBe(0);
    expect(r.ok && r.bloqueos).toBe(3);
    expect(r.ok && r.totalEventos).toBe(3);
  });

  it('el próximo checkout considera también los bloqueos: un bloqueo que termina libera el apartamento', () => {
    const r = previsualizarIcs(fixture('solo-bloqueos.ics'), HOY);
    expect(r.ok && r.proximoCheckout).toBe('2026-09-06');
  });

  it('clasifica por DESCRIPTION, no por SUMMARY', () => {
    // Mismo SUMMARY 'Reserved' en los dos eventos; solo uno trae URL de reserva.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTEND;VALUE=DATE:20261001',
      'SUMMARY:Reserved',
      'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/ABC123XYZ0',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTEND;VALUE=DATE:20261002',
      'SUMMARY:Reserved',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const r = previsualizarIcs(ics, HOY);
    expect(r.ok && r.reservas).toBe(1);
    expect(r.ok && r.bloqueos).toBe(1);
  });

  it('el bloqueo de Airbnb sin DESCRIPTION no cuenta como reserva', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTEND;VALUE=DATE:20261001',
      'SUMMARY:Airbnb (Not available)',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const r = previsualizarIcs(ics, HOY);
    expect(r.ok && r.reservas).toBe(0);
  });

  it('cuenta como reserva un evento cuya DESCRIPTION venía plegada', () => {
    const r = previsualizarIcs(fixture('folded.ics'), HOY);
    expect(r.ok && r.totalEventos).toBe(1);
    expect(r.ok && r.reservas).toBe(1);
    expect(r.ok && r.bloqueos).toBe(0);
    expect(r.ok && r.proximoCheckout).toBe('2026-09-04');
  });
});

describe('previsualizarIcs — fechas', () => {
  it('devuelve null si todos los checkouts ya pasaron', () => {
    const r = previsualizarIcs(fixture('solo-pasado.ics'), HOY);
    expect(r.ok).toBe(true);
    expect(r.ok && r.reservas).toBe(2);
    expect(r.ok && r.proximoCheckout).toBeNull();
  });

  it('cruza el año sin perderse: 20251229 → 20260103 da 2026-01-03', () => {
    const r = previsualizarIcs(fixture('fin-de-ano.ics'), '2025-12-30');
    expect(r.ok && r.proximoCheckout).toBe('2026-01-03');
  });

  it('no inventa un checkout de fin de año cuando ya pasó', () => {
    const r = previsualizarIcs(fixture('fin-de-ano.ics'), HOY);
    expect(r.ok && r.proximoCheckout).toBeNull();
  });

  it('acepta DTEND sin el parámetro VALUE=DATE', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTEND:20261001',
      'SUMMARY:Airbnb (Not available)',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const r = previsualizarIcs(ics, HOY);
    expect(r.ok && r.proximoCheckout).toBe('2026-10-01');
  });

  it('deja dtstamp en null si el calendario no lo trae', () => {
    const ics = ['BEGIN:VCALENDAR', 'END:VCALENDAR'].join('\n');
    const r = previsualizarIcs(ics, HOY);
    expect(r.ok && r.dtstamp).toBeNull();
  });
});
