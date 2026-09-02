import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { desdoblar } from './ical';
import { normalizarIcs, type EventoNormalizado } from './ical-normalizar';

const fixture = (nombre: string) =>
  readFileSync(new URL(`./__fixtures__/ical/${nombre}`, import.meta.url), 'utf8');

const REAL = 'airbnb-real-anonimizado.ics';

/**
 * Los 15 `DTEND` del feed real ya en forma de dia de negocio. SON, uno a uno, las 15
 * fechas de aseo esperadas: al `DTEND` no se le suma ni se le resta nada.
 */
const CHECKOUTS = [
  '2026-09-02',
  '2026-09-06',
  '2026-09-13',
  '2026-09-20',
  '2026-09-27',
  '2026-10-06',
  '2026-10-10',
  '2026-10-12',
  '2026-10-18',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
  '2026-11-22',
  '2026-12-27',
  '2027-01-04',
];

/** Los 15 codigos, en el mismo orden del archivo. */
const CODIGOS = [
  'HME3F6BX75',
  'HMALX5BL36',
  'HMKM5XK6UG',
  'HM5988NZYQ',
  'HMWB84STVF',
  'HMNGGVZVXW',
  'HM6EM4A5K5',
  'HMUBST2KCZ',
  'HMUAPF4QHL',
  'HMMRCQT96H',
  'HM82YXZDW4',
  'HMSRGQ3ZU2',
  'HM24FL585C',
  'HM5RCG7NBM',
  'HMCQXAGF9W',
];

/** Los telefonos se sacan DEL PROPIO ARCHIVO, para que el test no envejezca. */
function telefonosDe(crudo: string): string[] {
  return [...desdoblar(crudo).matchAll(/Phone Number \(Last 4 Digits\): (\d{4})/g)].map(
    (m) => m[1],
  );
}

const calendario = (cuerpo: string) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', cuerpo, 'END:VCALENDAR', ''].join('\n');

describe('normalizarIcs contra el feed real', () => {
  it('produce 15 eventos con endsOn EXACTAMENTE igual al DTEND, uno a uno', () => {
    const eventos = normalizarIcs(fixture(REAL));

    expect(eventos).toHaveLength(15);
    // Una a una y no por conteo: 15 eventos con la misma fecha pasarian una
    // asercion de longitud. Al DTEND no se le suma ni se le resta un dia: es
    // exclusivo en el formato y coincide con el dia en que el calendario libera el
    // apartamento. Es la regla de dominio que mas veces se rompe en este tipo de
    // proyecto, y el senuelo del plan 03-02 mide que esta asercion la protege.
    expect(eventos.map((e) => e.endsOn)).toEqual(CHECKOUTS);
  });

  it('la reserva de una noche tiene el checkout al dia siguiente del DTSTART', () => {
    const eventos = normalizarIcs(
      calendario(
        [
          'BEGIN:VEVENT',
          'UID:unanoche@airbnb.com',
          'DTSTART;VALUE=DATE:20260903',
          'DTEND;VALUE=DATE:20260904',
          'SUMMARY:Reserved',
          'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMONE1NIGHT',
          'END:VEVENT',
        ].join('\n'),
      ),
    );

    expect(eventos[0].startsOn).toBe('2026-09-03');
    expect(eventos[0].endsOn).toBe('2026-09-04');
  });

  it('los 15 traen codigo de reserva con forma HM mas ocho', () => {
    const eventos = normalizarIcs(fixture(REAL));

    expect(eventos.map((e) => e.reservationCode)).toEqual(CODIGOS);
    for (const e of eventos) {
      expect(e.reservationCode).toMatch(/^HM[A-Z0-9]{8}$/);
      expect(e.reservationCode).toHaveLength(10);
      expect(e.clasificacion).toBe('reserva');
    }
  });
});

describe('privacidad: el telefono del huesped muere aqui', () => {
  it('no sale del normalizador, y los codigos SI salen', () => {
    const crudo = fixture(REAL);
    const eventos = normalizarIcs(crudo);

    const telefonos = telefonosDe(crudo);
    // El test se prueba a si mismo: si la fixture dejara de traer telefonos, esta
    // asercion cae y nadie se queda creyendo que la ausencia significa algo.
    expect(telefonos).toHaveLength(15);

    const serializado = JSON.stringify(eventos);

    expect(serializado).not.toMatch(/Phone Number/i);
    expect(serializado).not.toMatch(/Last 4 Digits/i);
    expect(serializado).not.toMatch(/airbnb\.com\/hosting/i);
    expect(serializado).not.toMatch(/Reservation URL/i);

    // LOS DIGITOS PELADOS SE COMPARAN SIN EL HASH, y es deliberado. El hash son 64
    // caracteres hexadecimales: la probabilidad de que una corrida de cuatro
    // digitos decimales aparezca por casualidad en alguno de los 15 no es
    // despreciable, y un rojo por esa razon no tiene NADA que ver con privacidad y
    // acabaria borrado por alguien con prisa. Que el telefono no entre en el hash lo
    // mide, aparte, el test de estabilidad de mas abajo.
    const sinHash = JSON.stringify(
      eventos.map(({ payloadHash: _h, ...resto }) => resto),
    );
    for (const t of telefonos) expect(sinHash).not.toContain(t);

    // CONTROL POSITIVO, en el MISMO test: sin el, un normalizador que devolviera la
    // lista vacia pasaria todas las aserciones de ausencia de arriba.
    expect(eventos.filter((e) => e.reservationCode !== null)).toHaveLength(15);
    for (const codigo of CODIGOS) expect(serializado).toContain(codigo);
  });

  it('el tipo de salida no tiene ranura para la descripcion', () => {
    const eventos = normalizarIcs(fixture(REAL));

    // Estructural, no textual: se enumera lo que el objeto TIENE. Un campo nuevo,
    // llamado como se llame, cae aqui. La garantia dura la da el tipo (pasar la
    // descripcion hacia adelante es un error de compilacion); esto es la red de
    // seguridad en tiempo de ejecucion.
    expect(Object.keys(eventos[0]).sort()).toEqual([
      'clasificacion',
      'endsOn',
      'payloadHash',
      'reservationCode',
      'startsOn',
      'summary',
      'uid',
    ]);
  });
});

describe('payloadHash', () => {
  it('es estable entre dos llamadas con la misma entrada', () => {
    const a = normalizarIcs(fixture(REAL));
    const b = normalizarIcs(fixture(REAL));

    expect(a.map((e) => e.payloadHash)).toEqual(b.map((e) => e.payloadHash));
  });

  it('cambia cuando cambia endsOn, y SOLO el del evento que cambio', () => {
    // `airbnb-real-movida.ics` mueve el DTEND de la reserva 5 (indice 4) de
    // 2026-09-27 a 2026-09-29 y no toca nada mas.
    const real = normalizarIcs(fixture(REAL));
    const movida = normalizarIcs(fixture('airbnb-real-movida.ics'));

    expect(movida[4].endsOn).toBe('2026-09-29');
    expect(movida[4].payloadHash).not.toBe(real[4].payloadHash);

    // Los otros 14 intactos: sin esto, un hash que cambiara siempre pasaria la
    // asercion de arriba sin medir nada.
    for (let i = 0; i < real.length; i += 1) {
      if (i === 4) continue;
      expect(movida[i].payloadHash).toBe(real[i].payloadHash);
    }
  });

  it('NO cambia cuando solo cambia el telefono dentro del DESCRIPTION', () => {
    const crudo = fixture(REAL);
    const conOtroTelefono = crudo.replace(
      /Phone Number \(Last 4 Digits\): \d{4}/g,
      'Phone Number (Last 4 Digits): 9999',
    );

    // CONTROL: la mutacion tiene que haber surtido efecto de verdad.
    expect(conOtroTelefono).not.toBe(crudo);
    expect(new Set(telefonosDe(conOtroTelefono))).toEqual(new Set(['9999']));

    const real = normalizarIcs(crudo);
    const mutado = normalizarIcs(conOtroTelefono);

    // El hash se calcula sobre los campos NORMALIZADOS, no sobre el evento crudo.
    // Dos razones y las dos importan: un hash del crudo seria un derivado
    // persistido del dato personal, y ademas cambiaria cada vez que Airbnb rotara
    // un digito, disparando un diff vacio en cada corrida.
    expect(mutado.map((e) => e.payloadHash)).toEqual(real.map((e) => e.payloadHash));
  });

  it('distingue dos eventos que solo difieren en el codigo de reserva', () => {
    const base = (codigo: string) =>
      calendario(
        [
          'BEGIN:VEVENT',
          'UID:igual@airbnb.com',
          'DTSTART;VALUE=DATE:20261001',
          'DTEND;VALUE=DATE:20261003',
          'SUMMARY:Reserved',
          `DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/${codigo}`,
          'END:VEVENT',
        ].join('\n'),
      );

    expect(normalizarIcs(base('HMAAAAAAAA'))[0].payloadHash).not.toBe(
      normalizarIcs(base('HMBBBBBBBB'))[0].payloadHash,
    );
  });
});

describe('normalizarIcs: los casos que no son la reserva feliz', () => {
  it('un evento sin codigo extraible conserva el uid y deja el codigo nulo', () => {
    const eventos = normalizarIcs(fixture('airbnb-bloqueos-1dia.ics'));

    expect(eventos).toHaveLength(90);
    for (const e of eventos) {
      expect(e.uid).toMatch(/@airbnb\.com$/);
      expect(e.reservationCode).toBeNull();
      expect(e.clasificacion).toBe('bloqueo');
    }
  });

  it('el DESCRIPTION mutilado da 15 eventos desconocidos y sin codigo', () => {
    const eventos = normalizarIcs(fixture('airbnb-desc-mutilado.ics'));

    expect(eventos).toHaveLength(15);
    expect(eventos.every((e) => e.clasificacion === 'desconocido')).toBe(true);
    expect(eventos.every((e) => e.reservationCode === null)).toBe(true);
  });

  it('un evento no interpretable sale con fechas nulas y clasificado desconocido', () => {
    const eventos = normalizarIcs(
      calendario(
        [
          'BEGIN:VEVENT',
          'UID:conhora@airbnb.com',
          'DTSTART;TZID=Europe/Madrid:20260406T100000',
          'DTEND;TZID=Europe/Madrid:20260406T110000',
          'SUMMARY:Reserved',
          'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMDATETIME',
          'END:VEVENT',
        ].join('\n'),
      ),
    );

    // NO se descarta en silencio: sigue saliendo, para que el pipeline pueda alertar.
    expect(eventos).toHaveLength(1);
    expect(eventos[0].clasificacion).toBe('desconocido');
    expect(eventos[0].startsOn).toBeNull();
    expect(eventos[0].endsOn).toBeNull();
  });
});

describe('invariancia de zona horaria', () => {
  const tzOriginal = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tzOriginal;
  });

  it('la salida completa es identica bajo TZ=UTC y bajo TZ=America/Bogota', () => {
    const crudo = fixture(REAL);

    process.env.TZ = 'UTC';
    const enUtc: EventoNormalizado[] = normalizarIcs(crudo);
    const horaUtc = new Date(Date.UTC(2026, 8, 2)).getHours();

    process.env.TZ = 'America/Bogota';
    const enBogota: EventoNormalizado[] = normalizarIcs(crudo);
    const horaBogota = new Date(Date.UTC(2026, 8, 2)).getHours();

    // CONTROL: la mutacion de la zona surte efecto de verdad. Sin el, esta suite
    // compararia dos corridas bajo la misma zona y pasaria por vacuidad.
    expect(horaUtc).not.toBe(horaBogota);

    expect(JSON.stringify(enBogota)).toBe(JSON.stringify(enUtc));
    expect(enUtc[0].endsOn).toBe('2026-09-02');
    expect(enBogota[0].endsOn).toBe('2026-09-02');
  });
});
