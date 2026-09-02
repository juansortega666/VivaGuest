import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { clasificar } from './ical-clasificar';
import { desdoblar, parsearIcs, type VEventoCrudo } from './ical';

const fixture = (nombre: string) =>
  readFileSync(new URL(`./__fixtures__/ical/${nombre}`, import.meta.url), 'utf8');

/** Cuenta cuantos eventos de un feed caen en cada uno de los tres valores. */
function reparto(nombre: string) {
  const { eventos } = parsearIcs(fixture(nombre));
  const clases = eventos.map(clasificar);
  return {
    eventos: eventos.length,
    reserva: clases.filter((c) => c === 'reserva').length,
    bloqueo: clases.filter((c) => c === 'bloqueo').length,
    desconocido: clases.filter((c) => c === 'desconocido').length,
  };
}

/** Un evento crudo minimo, para los casos que ninguna fixture cubre. */
const evento = (parcial: Partial<VEventoCrudo> = {}): VEventoCrudo => ({
  uid: 'x@airbnb.com',
  summary: null,
  dtstart: '20261001',
  dtend: '20261003',
  description: null,
  interpretable: true,
  defecto: null,
  ...parcial,
});

const URL_RESERVA =
  'Reservation URL: https://www.airbnb.com/hosting/reservations/details/HME3F6BX75';

describe('el control de las fixtures: el grep crudo miente', () => {
  // MEDIDO en el plan 03-01: buscar la ruta de detalle sobre el archivo CRUDO
  // devuelve 0 tambien para el feed REAL, porque el plegado a 75 octetos la parte
  // en dos lineas. Un test que use ese grep pasa por vacuidad. La comprobacion
  // valida es sobre el texto desdoblado, y con control positivo.
  const ocurrencias = (nombre: string, desdoblado: boolean) => {
    const texto = fixture(nombre);
    return ((desdoblado ? desdoblar(texto) : texto).match(/reservations\/details\//g) ?? [])
      .length;
  };

  it('sobre el crudo, el feed real y el mutilado son indistinguibles: 0 y 0', () => {
    expect(ocurrencias('airbnb-real-anonimizado.ics', false)).toBe(0);
    expect(ocurrencias('airbnb-desc-mutilado.ics', false)).toBe(0);
  });

  it('sobre el texto desdoblado si se distinguen: 15 y 0', () => {
    expect(ocurrencias('airbnb-real-anonimizado.ics', true)).toBe(15);
    expect(ocurrencias('airbnb-desc-mutilado.ics', true)).toBe(0);
  });
});

describe('clasificar contra las fixtures', () => {
  it('los 15 eventos del feed real son reserva, por la URL de detalle', () => {
    expect(reparto('airbnb-real-anonimizado.ics')).toEqual({
      eventos: 15,
      reserva: 15,
      bloqueo: 0,
      desconocido: 0,
    });
  });

  it('los 90 bloqueos de un dia son bloqueo, y NINGUNO reserva', () => {
    // La magnitud es el punto: si el clasificador se equivoca aqui, esto no son 90
    // filas de mas, son 90 aseos fantasma en un solo apartamento y en una corrida.
    expect(reparto('airbnb-bloqueos-1dia.ics')).toEqual({
      eventos: 90,
      reserva: 0,
      bloqueo: 90,
      desconocido: 0,
    });
  });

  it('un SUMMARY jamas visto sin URL de reserva es desconocido, ni reserva ni bloqueo', () => {
    expect(reparto('airbnb-summary-desconocido.ics')).toEqual({
      eventos: 3,
      reserva: 0,
      bloqueo: 0,
      desconocido: 3,
    });
  });

  it('el DESCRIPTION mutilado da CERO reservas sobre QUINCE eventos', () => {
    // Las dos mitades son la misma asercion: sin `eventos: 15`, un parser roto que
    // devolviera la lista vacia pasaria la parte de `reserva: 0`. Es el Pitfall 5
    // del research y la razon de que la guarda de colapso mire reservas
    // clasificadas y no eventos.
    const r = reparto('airbnb-desc-mutilado.ics');
    expect(r.eventos).toBe(15);
    expect(r.reserva).toBe(0);
    expect(r.desconocido).toBe(15);
  });
});

describe('clasificar: las reglas', () => {
  it('el defecto de forma gana sobre la URL de reserva', () => {
    // Un evento con DTEND con hora y zona llega con `interpretable: false`. Aunque
    // traiga la URL, NO clasifica reserva: no hay fecha de aseo que no sea adivinada.
    const conHora = evento({
      description: URL_RESERVA,
      summary: 'Reserved',
      dtstart: null,
      dtend: null,
      interpretable: false,
      defecto: 'fecha-no-es-dia-completo',
    });

    expect(clasificar(conHora)).toBe('desconocido');
    // CONTROL: el MISMO evento, sin el defecto de forma, si es reserva. Sin esto,
    // la asercion de arriba pasaria aunque la URL no se estuviera mirando nunca.
    expect(clasificar({ ...conHora, interpretable: true, defecto: null })).toBe('reserva');
  });

  it.each([
    'Airbnb (Not available)',
    'Airbnb (Not Available)',
    'Not available',
    'Not Available',
    'Blocked',
    'Unavailable',
  ])('la variante historica %s del SUMMARY de bloqueo clasifica bloqueo', (summary) => {
    expect(clasificar(evento({ summary }))).toBe('bloqueo');
  });

  it('URL de reserva Y SUMMARY de bloqueo a la vez: gana reserva', () => {
    // La whitelist positiva sobre DESCRIPTION es el discriminador con mejor
    // evidencia (1708/1708 contra 0/700 sobre 432 snapshots). El SUMMARY es el
    // discriminador de respaldo, no el primario.
    expect(
      clasificar(
        evento({ summary: 'Airbnb (Not available)', description: URL_RESERVA }),
      ),
    ).toBe('reserva');
  });

  it('un evento sin SUMMARY y sin DESCRIPTION es desconocido', () => {
    expect(clasificar(evento())).toBe('desconocido');
  });

  it('un SUMMARY que solo dice Reserved NO basta para clasificar reserva', () => {
    // No se clasifica por SUMMARY hacia el lado positivo: si Airbnb cambiara el
    // formato del DESCRIPTION, un `Reserved` suelto seguiria generando aseos y el
    // cambio pasaria inadvertido. Fallar cerrado exige que el codigo de reserva
    // este, porque es lo que el resto del pipeline necesita para identificar.
    expect(clasificar(evento({ summary: 'Reserved' }))).toBe('desconocido');
  });

  it('una URL que no es la ruta de detalle no clasifica reserva', () => {
    expect(
      clasificar(
        evento({ description: 'Reservation URL: https://www.airbnb.com/hosting/rsrvtns/dtls/HME3F6BX75' }),
      ),
    ).toBe('desconocido');
  });
});
