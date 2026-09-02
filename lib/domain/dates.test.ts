import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatFechaBog, formatHoraLimite, hoyBog } from './dates';

/**
 * Estos tests corren con `TZ=UTC` (fijado en `vitest.config.ts`). Es la zona en la que
 * el bug de Pitfall 10 se esconde: `new Date('2026-09-04')` se parsea como medianoche
 * UTC y solo se corre un dia al renderizar en Bogota. Por eso hay ademas un caso que
 * cambia `process.env.TZ` a America/Bogota en caliente: con la implementacion ingenua
 * ese caso devuelve el dia anterior.
 */
const TZ_ORIGINAL = process.env.TZ;

afterEach(() => {
  process.env.TZ = TZ_ORIGINAL;
});

describe('formatFechaBog', () => {
  it('formatea una fecha de negocio con dia de la semana, dia y mes', () => {
    // 2026-09-04 cae viernes.
    expect(formatFechaBog('2026-09-04')).toBe('vie, 4 de septiembre');
  });

  it('el 1 de enero es el 1 de enero, no el 31 de diciembre', () => {
    expect(formatFechaBog('2026-01-01')).toBe('jue, 1 de enero');
  });

  it('da el mismo dia corriendo en Bogota que corriendo en UTC', () => {
    const enUtc = formatFechaBog('2026-01-01');
    process.env.TZ = 'America/Bogota';
    expect(formatFechaBog('2026-01-01')).toBe(enUtc);
  });

  it('no se corre tampoco al final del mes', () => {
    expect(formatFechaBog('2026-08-31')).toBe('lun, 31 de agosto');
    process.env.TZ = 'America/Bogota';
    expect(formatFechaBog('2026-08-31')).toBe('lun, 31 de agosto');
  });
});

describe('formatHoraLimite', () => {
  it('recorta los segundos que devuelve PostgREST para una columna time', () => {
    expect(formatHoraLimite('11:30:00')).toBe('11:30');
  });

  it('conserva el cero a la izquierda y usa 24 horas, sin AM/PM', () => {
    expect(formatHoraLimite('09:05:00')).toBe('09:05');
    expect(formatHoraLimite('00:00:00')).toBe('00:00');
    expect(formatHoraLimite('23:59:00')).toBe('23:59');
    expect(formatHoraLimite('13:00:00')).not.toContain('p');
  });

  it('acepta tambien la forma sin segundos', () => {
    expect(formatHoraLimite('11:30')).toBe('11:30');
  });
});

describe('hoyBog', () => {
  /**
   * La suite corre con `TZ=UTC` (vitest.config.ts). El caso que importa es el de
   * las cinco horas en que UTC ya cambio de dia y Bogota todavia no: si `hoyBog`
   * leyera el dia en UTC, el "proximo checkout" de APTO-12 se correria un dia
   * entero cada noche entre las 19:00 y la medianoche de Bogota.
   */
  it('devuelve el dia de BOGOTA, no el de UTC, en la ventana de las 19:00 a las 24:00', () => {
    vi.useFakeTimers();
    // 2026-09-05T02:30:00Z = 2026-09-04 21:30 en Bogota.
    vi.setSystemTime(new Date('2026-09-05T02:30:00Z'));
    expect(hoyBog()).toBe('2026-09-04');
    // CONTROL: sin la zona, el mismo instante da el dia siguiente. Sin esta
    // linea la asercion de arriba pasaria igual con una implementacion en UTC
    // si el instante elegido no cruzara la medianoche.
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-05');
    vi.useRealTimers();
  });

  it('emite ISO `YYYY-MM-DD`, que es lo que compara `previsualizarIcs`', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-09T18:00:00Z'));
    expect(hoyBog()).toBe('2026-01-09');
    expect(hoyBog()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    vi.useRealTimers();
  });
});
