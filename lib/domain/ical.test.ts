import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { aIso, desdoblar, desescapar, parsearIcs } from './ical';

/** Se lee el `.ics` crudo del disco: el plegado y los CRLF son parte del caso. */
const fixture = (nombre: string) =>
  readFileSync(new URL(`./__fixtures__/ical/${nombre}`, import.meta.url), 'utf8');

/**
 * Los 15 `DTEND` del feed real, en el orden en que aparecen en el archivo.
 * Se afirman UNO A UNO y no por conteo: un parser que devolviera 15 eventos con
 * la misma fecha pasaria una asercion de longitud.
 */
const DTEND_REALES = [
  '20260902',
  '20260906',
  '20260913',
  '20260920',
  '20260927',
  '20261006',
  '20261010',
  '20261012',
  '20261018',
  '20261102',
  '20261109',
  '20261116',
  '20261122',
  '20261227',
  '20270104',
];

/** Envoltorio de un `VEVENT` suelto dentro de un calendario minimo bien formado. */
const calendario = (cuerpo: string) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', cuerpo, 'END:VCALENDAR', ''].join('\n');

describe('desdoblar (RFC 5545 §3.1)', () => {
  it('normaliza CRLF a LF', () => {
    expect(desdoblar('A:1\r\nB:2\r\n')).toBe('A:1\nB:2\n');
  });

  it('une la continuacion marcada con un espacio', () => {
    expect(desdoblar('DESCRIPTION:abc\r\n def')).toBe('DESCRIPTION:abcdef');
  });

  it('une la continuacion marcada con un tabulador', () => {
    expect(desdoblar('DESCRIPTION:abc\r\n\tdef')).toBe('DESCRIPTION:abcdef');
  });

  it('no une lineas que no son continuacion', () => {
    expect(desdoblar('A:1\r\nB:2')).toBe('A:1\nB:2');
  });
});

describe('desescapar (RFC 5545 §3.3.11)', () => {
  it('convierte la secuencia de salto de linea', () => {
    expect(desescapar('a\\nb')).toBe('a\nb');
  });

  it('acepta tambien la forma mayuscula del salto de linea', () => {
    expect(desescapar('a\\Nb')).toBe('a\nb');
  });

  it('convierte la coma escapada', () => {
    expect(desescapar('a\\,b')).toBe('a,b');
  });

  it('convierte el punto y coma escapado', () => {
    expect(desescapar('a\\;b')).toBe('a;b');
  });

  it('convierte la barra invertida escapada', () => {
    expect(desescapar('a\\\\b')).toBe('a\\b');
  });

  it('no desescapa dos veces: una barra escapada seguida de n queda literal', () => {
    // `\\n` en el .ics es una barra invertida seguida de la letra n, NO un salto.
    // Un desescapado en dos pasadas (primero `\\`, luego `\n`) daria un salto de
    // linea aqui, que es el modo de fallo clasico de esta funcion.
    expect(desescapar('a\\\\nb')).toBe('a\\nb');
  });

  it('separa la URL de reserva del telefono dentro de un DESCRIPTION real', () => {
    const crudo = desdoblar(fixture('airbnb-real-anonimizado.ics'))
      .split('\n')
      .find((l) => l.startsWith('DESCRIPTION:'))!;
    const valor = desescapar(crudo.slice('DESCRIPTION:'.length));

    const [primera, segunda] = valor.split('\n');
    expect(primera).toBe(
      'Reservation URL: https://www.airbnb.com/hosting/reservations/details/HME3F6BX75',
    );
    expect(segunda).toBe('Phone Number (Last 4 Digits): 2370');
  });
});

describe('aIso', () => {
  const tzOriginal = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tzOriginal;
  });

  it('corta los ocho digitos crudos a la forma con guiones', () => {
    expect(aIso('20260902')).toBe('2026-09-02');
  });

  it('da lo mismo bajo TZ=UTC que bajo TZ=America/Bogota', () => {
    process.env.TZ = 'UTC';
    const enUtc = aIso('20260902');
    // CONTROL: la mutacion de la zona tiene que surtir efecto de verdad, o esta
    // asercion pasaria por vacuidad comparando dos corridas identicas.
    const horaUtc = new Date(Date.UTC(2026, 8, 2)).getHours();

    process.env.TZ = 'America/Bogota';
    const enBogota = aIso('20260902');
    const horaBogota = new Date(Date.UTC(2026, 8, 2)).getHours();

    expect(horaUtc).not.toBe(horaBogota);
    expect(enUtc).toBe('2026-09-02');
    expect(enBogota).toBe('2026-09-02');
  });
});

describe('parsearIcs contra el feed real', () => {
  it('devuelve los 15 eventos en el orden del archivo, con sus 15 DTEND crudos', () => {
    const doc = parsearIcs(fixture('airbnb-real-anonimizado.ics'));

    expect(doc.esCalendario).toBe(true);
    expect(doc.completo).toBe(true);
    expect(doc.eventos.map((e) => e.dtend)).toEqual(DTEND_REALES);
  });

  it('reconstruye el codigo de reserva partido por el plegado a 75 octetos', () => {
    const doc = parsearIcs(fixture('airbnb-real-anonimizado.ics'));

    expect(doc.eventos[0].description).toContain(
      'https://www.airbnb.com/hosting/reservations/details/HME3F6BX75',
    );
  });

  it('guarda los ocho digitos crudos, nunca una forma con guiones', () => {
    const doc = parsearIcs(fixture('airbnb-real-anonimizado.ics'));

    for (const ev of doc.eventos) {
      expect(ev.dtstart).toMatch(/^\d{8}$/);
      expect(ev.dtend).toMatch(/^\d{8}$/);
      expect(ev.interpretable).toBe(true);
    }
  });

  it('el feed con CRLF produce EXACTAMENTE el mismo resultado que el feed con LF', () => {
    // La unica prueba de que el desdoblado aguanta la forma en que Airbnb manda
    // de verdad (RFC 5545 §3.1 especifica CRLF). Se compara el documento COMPLETO,
    // no el conteo: dos parseos que coincidan en longitud y difieran en cada
    // descripcion pasarian una asercion de conteo.
    const conLf = parsearIcs(fixture('airbnb-real-anonimizado.ics'));
    const conCrlf = parsearIcs(fixture('airbnb-real-crlf.ics'));

    expect(conCrlf).toEqual(conLf);
    // CONTROL de que la comparacion no es trivial: el texto de partida SI difiere.
    expect(fixture('airbnb-real-crlf.ics')).not.toBe(
      fixture('airbnb-real-anonimizado.ics'),
    );
  });
});

describe('parsearIcs: los modos de fallo que descalificaron a node-ical', () => {
  it('dos VEVENT con el mismo UID producen DOS entradas, no una', () => {
    // MEDIDO con node-ical@0.27.1 sobre este mismo caso:
    //   "VEVENT en el texto: 2 | eventos devueltos: 1 | ends: ['2026-10-06']"
    // Indexa por UID y gana el ultimo. El primero desaparece sin aviso, la guarda
    // de colapso no salta porque el conteo no es cero, y esa reserva pierde su aseo.
    const texto = calendario(
      [
        'BEGIN:VEVENT',
        'UID:mismo@airbnb.com',
        'DTSTART;VALUE=DATE:20261001',
        'DTEND;VALUE=DATE:20261003',
        'SUMMARY:Reserved',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:mismo@airbnb.com',
        'DTSTART;VALUE=DATE:20261004',
        'DTEND;VALUE=DATE:20261006',
        'SUMMARY:Reserved',
        'END:VEVENT',
      ].join('\n'),
    );

    const doc = parsearIcs(texto);

    expect(doc.eventos).toHaveLength(2);
    expect(doc.eventos.map((e) => e.dtend)).toEqual(['20261003', '20261006']);
  });

  it('un DTSTART dentro de un VALARM no envenena la fecha del VEVENT', () => {
    const texto = calendario(
      [
        'BEGIN:VEVENT',
        'UID:anidado@airbnb.com',
        'DTSTART;VALUE=DATE:20261001',
        'DTEND;VALUE=DATE:20261003',
        'SUMMARY:Reserved',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DTSTART;VALUE=DATE:19990101',
        'DTEND;VALUE=DATE:19990102',
        'SUMMARY:No soy el evento',
        'END:VALARM',
        'END:VEVENT',
      ].join('\n'),
    );

    const doc = parsearIcs(texto);

    expect(doc.eventos).toHaveLength(1);
    expect(doc.eventos[0].dtstart).toBe('20261001');
    expect(doc.eventos[0].dtend).toBe('20261003');
    expect(doc.eventos[0].summary).toBe('Reserved');
    expect(doc.completo).toBe(true);
  });

  it('un VTIMEZONE con sus propios DTSTART no aporta ningun evento', () => {
    const texto = calendario(
      [
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Madrid',
        'BEGIN:STANDARD',
        'DTSTART:19701025T030000',
        'END:STANDARD',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:conzona@airbnb.com',
        'DTSTART;VALUE=DATE:20261001',
        'DTEND;VALUE=DATE:20261003',
        'END:VEVENT',
      ].join('\n'),
    );

    const doc = parsearIcs(texto);

    expect(doc.eventos).toHaveLength(1);
    expect(doc.eventos[0].dtstart).toBe('20261001');
    expect(doc.completo).toBe(true);
  });

  it('un DTEND con hora y zona se marca no interpretable, no se adivina', () => {
    const texto = calendario(
      [
        'BEGIN:VEVENT',
        'UID:conhora@airbnb.com',
        'DTSTART;TZID=Europe/Madrid:20260406T100000',
        'DTEND;TZID=Europe/Madrid:20260406T110000',
        'SUMMARY:Reserved',
        'END:VEVENT',
      ].join('\n'),
    );

    const doc = parsearIcs(texto);

    expect(doc.eventos).toHaveLength(1);
    expect(doc.eventos[0].interpretable).toBe(false);
    expect(doc.eventos[0].defecto).toBe('fecha-no-es-dia-completo');
    // NO se trunca a los ocho primeros digitos: adivinar la zona es el modo de
    // fallo documentado de los feeds "que sincronizan pero mal".
    expect(doc.eventos[0].dtend).toBeNull();
    expect(doc.eventos[0].dtstart).toBeNull();
  });

  it('un VEVENT sin DTEND se marca no interpretable', () => {
    const texto = calendario(
      [
        'BEGIN:VEVENT',
        'UID:sinfin@airbnb.com',
        'DTSTART;VALUE=DATE:20261001',
        'SUMMARY:Reserved',
        'END:VEVENT',
      ].join('\n'),
    );

    const doc = parsearIcs(texto);

    expect(doc.eventos[0].interpretable).toBe(false);
    expect(doc.eventos[0].defecto).toBe('fecha-ausente');
  });
});

describe('parsearIcs: documento incompleto', () => {
  it('el cuerpo truncado se marca incompleto aunque abra BEGIN:VCALENDAR', () => {
    const crudo = fixture('airbnb-truncado.ics');

    // CONTROL: el sniff de la Fase 2 lo deja pasar. Es justo la razon de existir
    // de esta senal, y sin este control el test no demuestra que aporte nada.
    expect(/BEGIN:VCALENDAR/i.test(crudo)).toBe(true);

    const doc = parsearIcs(crudo);

    expect(doc.esCalendario).toBe(true);
    expect(doc.completo).toBe(false);
    // 8 x BEGIN:VEVENT y 7 x END:VEVENT: el octavo, sin cerrar, NO se emite.
    expect(doc.eventos).toHaveLength(7);
  });

  it('un calendario sin END:VCALENDAR se marca incompleto', () => {
    const doc = parsearIcs('BEGIN:VCALENDAR\nVERSION:2.0\n');

    expect(doc.esCalendario).toBe(true);
    expect(doc.completo).toBe(false);
    expect(doc.eventos).toHaveLength(0);
  });

  it('un cuerpo que no es un calendario se marca como tal', () => {
    const doc = parsearIcs('<!DOCTYPE html><html><body>Oops</body></html>');

    expect(doc.esCalendario).toBe(false);
    expect(doc.completo).toBe(false);
    expect(doc.eventos).toHaveLength(0);
  });

  it('un calendario vacio pero bien cerrado esta completo', () => {
    const doc = parsearIcs('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n');

    expect(doc.esCalendario).toBe(true);
    expect(doc.completo).toBe(true);
    expect(doc.eventos).toHaveLength(0);
  });
});

describe('parsearIcs: tolerancia de forma', () => {
  it('acepta el nombre de propiedad en minusculas y con parametros', () => {
    const texto = calendario(
      [
        'begin:VEVENT',
        'uid:minusculas@airbnb.com',
        'dtstart;value=date:20261001',
        'DTEND:20261003',
        'summary:Reserved',
        'end:VEVENT',
      ].join('\n'),
    );

    const doc = parsearIcs(texto);

    expect(doc.eventos).toHaveLength(1);
    expect(doc.eventos[0].uid).toBe('minusculas@airbnb.com');
    expect(doc.eventos[0].dtstart).toBe('20261001');
    expect(doc.eventos[0].dtend).toBe('20261003');
    expect(doc.eventos[0].summary).toBe('Reserved');
  });
});
