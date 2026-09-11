import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatFechaBog,
  formatFechaCortaBog,
  formatFechaLargaBog,
  formatHoraLimite,
  horasDesdeDtstamp,
  hoyBog,
  sumarDias,
  tiempoRelativo,
} from './dates';

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

describe('formatFechaLargaBog', () => {
  it('formatea una fecha de negocio SIN dia de la semana', () => {
    // Es la forma que pide el `title` de la columna AVISOS (05-UI-SPEC §5.2):
    // `Activos desde el 8 de septiembre.`
    expect(formatFechaLargaBog('2026-09-08')).toBe('8 de septiembre');
  });

  it('el 1 de enero es el 1 de enero, no el 31 de diciembre', () => {
    expect(formatFechaLargaBog('2026-01-01')).toBe('1 de enero');
  });

  it('da el mismo dia corriendo en Bogota que corriendo en UTC', () => {
    const enUtc = formatFechaLargaBog('2026-01-01');
    process.env.TZ = 'America/Bogota';
    expect(formatFechaLargaBog('2026-01-01')).toBe(enUtc);
  });
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

describe('sumarDias', () => {
  /**
   * Los tres casos donde la resta a pelo de 86 400 000 milisegundos falla, y que
   * es la razon por la que esta funcion usa aritmetica de calendario.
   */
  it('cruza mes, ano y bisiesto sin desviarse', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDias('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('con cero devuelve el mismo dia', () => {
    expect(sumarDias('2026-09-12', 0)).toBe('2026-09-12');
  });

  it('NO depende de la zona del proceso', () => {
    // Es la propiedad que importa: el bloque del codigo de acceso decide su
    // ventana con esto, en el TELEFONO del aseador, y un resultado que se
    // moviera con la zona del dispositivo escondería el boton el dia del aseo.
    process.env.TZ = 'America/Bogota';
    expect(sumarDias('2026-09-12', 1)).toBe('2026-09-13');
    process.env.TZ = 'Pacific/Kiritimati';
    expect(sumarDias('2026-09-12', 1)).toBe('2026-09-13');
  });
});

describe('horasDesdeDtstamp', () => {
  const AHORA = Date.UTC(2026, 8, 1, 14, 30, 0); // 2026-09-01T14:30:00Z

  it('cuenta horas ENTERAS desde el DTSTAMP del VCALENDAR', () => {
    // El DTSTAMP de `__fixtures__/ical/feliz.ics`, 2h30m antes.
    expect(horasDesdeDtstamp('20260901T120000Z', AHORA)).toBe(2);
  });

  it('trunca hacia abajo: 59 minutos siguen siendo 0 h', () => {
    expect(horasDesdeDtstamp('20260901T133100Z', AHORA)).toBe(0);
  });

  it('sin DTSTAMP devuelve null y la linea se omite', () => {
    expect(horasDesdeDtstamp(null, AHORA)).toBeNull();
  });

  it('una forma que no es la UTC basica devuelve null en vez de inventar', () => {
    expect(horasDesdeDtstamp('2026-09-01T12:00:00Z', AHORA)).toBeNull();
    expect(horasDesdeDtstamp('20260901T120000', AHORA)).toBeNull();
    expect(horasDesdeDtstamp('basura', AHORA)).toBeNull();
  });

  it('un feed con el reloj adelantado no dice "hace -3 h"', () => {
    expect(horasDesdeDtstamp('20260901T173000Z', AHORA)).toBe(0);
  });

  it('el mes se interpreta bien: no hay off-by-one de indice', () => {
    // `Date.UTC` toma el mes en base 0. Sin el `-1` esto daria 744 h (un mes).
    expect(horasDesdeDtstamp('20260901T143000Z', AHORA)).toBe(0);
    expect(horasDesdeDtstamp('20260831T143000Z', AHORA)).toBe(24);
  });
});

describe('formatFechaCortaBog', () => {
  it('formatea la fecha corta de la bandeja: dia y mes abreviado, sin punto y sin ano', () => {
    // UI-SPEC §9: `3 sep`, no `jue, 3 de septiembre`, que no cabe en 176px de carril.
    expect(formatFechaCortaBog('2026-09-03')).toBe('3 sep');
  });

  it('no pone cero a la izquierda ni en el dia ni en el mes', () => {
    expect(formatFechaCortaBog('2026-01-01')).toBe('1 ene');
    expect(formatFechaCortaBog('2026-01-09')).toBe('9 ene');
  });

  it('cubre los doce meses con la abreviatura de tres letras', () => {
    const meses = [
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
    ];
    for (const [i, mes] of meses.entries()) {
      const mm = String(i + 1).padStart(2, '0');
      expect(formatFechaCortaBog(`2026-${mm}-15`)).toBe(`15 ${mes}`);
    }
  });

  it('septiembre es `sep`, no `sept`', () => {
    // `Intl` en es-CO devuelve `3 de sept` para este mismo dia: por eso la tabla de
    // meses es explicita y no sale de `Intl`. Ver el comentario en `dates.ts`.
    expect(formatFechaCortaBog('2026-09-03')).not.toContain('sept');
  });

  it('da el mismo dia corriendo en Bogota que corriendo en UTC', () => {
    const enUtc = formatFechaCortaBog('2026-01-01');
    process.env.TZ = 'America/Bogota';
    expect(formatFechaCortaBog('2026-01-01')).toBe(enUtc);
    expect(formatFechaCortaBog('2026-01-01')).toBe('1 ene');
  });

  it('no se corre tampoco al final del mes ni al final del ano', () => {
    expect(formatFechaCortaBog('2026-08-31')).toBe('31 ago');
    expect(formatFechaCortaBog('2026-12-31')).toBe('31 dic');
    process.env.TZ = 'America/Bogota';
    expect(formatFechaCortaBog('2026-08-31')).toBe('31 ago');
    expect(formatFechaCortaBog('2026-12-31')).toBe('31 dic');
  });
});

describe('tiempoRelativo', () => {
  // 2026-09-03T14:20:00-05:00 = jueves 3 de septiembre, 14:20 en Bogota.
  const AHORA = Date.parse('2026-09-03T14:20:00-05:00');

  it('bajo un minuto cuenta segundos (UI-SPEC §13.2: `Actualizado hace 40 s`)', () => {
    expect(tiempoRelativo(AHORA - 40_000, AHORA)).toBe('hace 40 s');
    expect(tiempoRelativo(AHORA - 59_000, AHORA)).toBe('hace 59 s');
  });

  it('bajo una hora cuenta minutos enteros', () => {
    expect(tiempoRelativo(AHORA - 8 * 60_000, AHORA)).toBe('hace 8 min');
    expect(tiempoRelativo(AHORA - 60_000, AHORA)).toBe('hace 1 min');
    expect(tiempoRelativo(AHORA - 59 * 60_000 - 59_000, AHORA)).toBe('hace 59 min');
  });

  it('a partir de una hora y dentro del mismo dia de Bogota cuenta horas', () => {
    expect(tiempoRelativo(AHORA - 3_600_000, AHORA)).toBe('hace 1 h');
    expect(tiempoRelativo(AHORA - 3 * 3_600_000, AHORA)).toBe('hace 3 h');
  });

  it('el dia calendario ANTERIOR de Bogota dice `ayer` con la hora de Bogota', () => {
    expect(tiempoRelativo(Date.parse('2026-09-02T14:20:00-05:00'), AHORA)).toBe(
      'ayer 14:20',
    );
  });

  /**
   * SEÑUELO DEL DESFASE.
   *
   * El corte de "ayer" se decide por DIA CALENDARIO DE BOGOTA, no restando 24 horas.
   * Estos dos instantes distan menos de 24 h del ahora y, aun asi, uno es de ayer y el
   * otro es de hoy: la frontera esta en las 00:00 de Bogota, que en UTC son las 05:00.
   *
   * Escribir estas marcas con `Z` en vez de con el desfase `-05:00` mueve las dos al
   * otro lado de la frontera y pone el caso en rojo. Se corrio.
   */
  it('senuelo: la frontera de `ayer` es la medianoche de Bogota, no la de UTC', () => {
    // Miercoles 2, 23:30 de Bogota. En UTC ya es el jueves 3 a las 04:30.
    expect(tiempoRelativo(Date.parse('2026-09-02T23:30:00-05:00'), AHORA)).toBe(
      'ayer 23:30',
    );
    // Jueves 3, 00:30 de Bogota. En UTC sigue siendo el jueves 3 a las 05:30.
    expect(tiempoRelativo(Date.parse('2026-09-03T00:30:00-05:00'), AHORA)).toBe(
      'hace 13 h',
    );
  });

  it('mas atras de ayer da la fecha corta con la hora de Bogota', () => {
    expect(tiempoRelativo(Date.parse('2026-09-01T14:20:00-05:00'), AHORA)).toBe(
      '1 sep 14:20',
    );
    expect(tiempoRelativo(Date.parse('2026-08-30T09:05:00-05:00'), AHORA)).toBe(
      '30 ago 09:05',
    );
  });

  it('acepta la cadena ISO que devuelve PostgREST para un timestamptz', () => {
    expect(tiempoRelativo('2026-09-03T19:12:00+00:00', AHORA)).toBe('hace 8 min');
  });

  it('una marca nula o ilegible devuelve null, no un valor inventado', () => {
    expect(tiempoRelativo(null, AHORA)).toBeNull();
    expect(tiempoRelativo(undefined, AHORA)).toBeNull();
    expect(tiempoRelativo('basura', AHORA)).toBeNull();
    expect(tiempoRelativo('', AHORA)).toBeNull();
    expect(tiempoRelativo(Number.NaN, AHORA)).toBeNull();
  });

  it('un reloj adelantado no dice `hace -3 h`', () => {
    // Misma regla que `horasDesdeDtstamp`: se trunca a 0.
    expect(tiempoRelativo(AHORA + 3 * 3_600_000, AHORA)).toBe('hace 0 s');
  });

  it('no depende de la zona del proceso', () => {
    const enUtc = tiempoRelativo(Date.parse('2026-09-02T23:30:00-05:00'), AHORA);
    process.env.TZ = 'America/Bogota';
    expect(tiempoRelativo(Date.parse('2026-09-02T23:30:00-05:00'), AHORA)).toBe(enUtc);
    expect(enUtc).toBe('ayer 23:30');
  });
});
