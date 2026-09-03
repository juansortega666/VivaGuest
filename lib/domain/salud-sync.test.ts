import { describe, expect, it } from 'vitest';

import { UMBRAL_SYNC_CAIDA_MS, estadoDeSincronizacion } from './salud-sync';

/**
 * El instante de referencia de todo este archivo. Es un valor fijo y no
 * `Date.now()`: un test que lee el reloj mide una cosa distinta cada vez que
 * corre, y el fallo aparece a las 3 de la mañana en CI sin forma de reproducirlo.
 */
const AHORA = Date.parse('2026-09-02T18:00:00.000Z');

/** Construye un instante ISO desplazado hacia atras desde `AHORA`. */
function haceMinutos(minutos: number): string {
  return new Date(AHORA - minutos * 60_000).toISOString();
}

describe('estadoDeSincronizacion', () => {
  it('sin ninguna sincronizacion previa, la sincronizacion esta caida', () => {
    // `max(last_success_at)` sobre cero filas, o sobre feeds que nunca
    // sincronizaron, devuelve NULL. Es el estado de un despliegue nuevo cuyo
    // scheduler nunca llego a correr, y es exactamente el caso que hay que ver.
    expect(estadoDeSincronizacion(null, AHORA)).toBe('caida');
  });

  it('con la sincronizacion mas reciente hace 2 horas, esta sana', () => {
    expect(estadoDeSincronizacion(haceMinutos(120), AHORA)).toBe('sana');
  });

  it('con la sincronizacion mas reciente hace 3 horas y 1 minuto, esta caida', () => {
    expect(estadoDeSincronizacion(haceMinutos(181), AHORA)).toBe('caida');
  });

  it('el umbral es de tres horas exactas, y se cruza justo despues', () => {
    // Las dos direcciones del borde en la misma asercion: sin la de abajo, un
    // umbral de treinta horas pasaria los tres tests anteriores igual.
    expect(estadoDeSincronizacion(haceMinutos(180), AHORA)).toBe('sana');
    expect(estadoDeSincronizacion(haceMinutos(180.5), AHORA)).toBe('caida');
    expect(UMBRAL_SYNC_CAIDA_MS).toBe(3 * 60 * 60 * 1000);
  });

  it('es pura y determinista: el instante actual ENTRA POR PARAMETRO', () => {
    // La propiedad que hace que esta funcion se pueda probar. Se demuestra
    // moviendo SOLO el segundo argumento sobre la misma marca de tiempo: el
    // mismo feed pasa de sano a caido sin que nada del sistema cambie.
    const marca = haceMinutos(0);

    expect(estadoDeSincronizacion(marca, AHORA)).toBe('sana');
    expect(estadoDeSincronizacion(marca, AHORA + 4 * 60 * 60 * 1000)).toBe('caida');

    // Y llamarla dos veces con los mismos argumentos da lo mismo, que es lo
    // que un `Date.now()` escondido dentro romperia.
    expect(estadoDeSincronizacion(marca, AHORA)).toBe(
      estadoDeSincronizacion(marca, AHORA),
    );
  });

  it('bajo TZ=UTC y bajo TZ=America/Bogota devuelve lo mismo', () => {
    // `vitest.config.ts` fija TZ=UTC a proposito, asi que un error de zona
    // seria SILENCIOSO en toda la suite. Este test cambia la zona del proceso
    // a mano, que es la unica forma de que aparezca.
    //
    // La propiedad no es cosmetica: es la diferencia entre que el panel diga
    // "caida" a las 15:00 de Bogota y a las 20:00 UTC del mismo instante.
    const original = process.env.TZ;
    const marca = haceMinutos(181);
    const marcaSana = haceMinutos(120);

    try {
      process.env.TZ = 'UTC';
      const utcCaida = estadoDeSincronizacion(marca, AHORA);
      const utcSana = estadoDeSincronizacion(marcaSana, AHORA);

      process.env.TZ = 'America/Bogota';
      const bogCaida = estadoDeSincronizacion(marca, AHORA);
      const bogSana = estadoDeSincronizacion(marcaSana, AHORA);

      expect(utcCaida).toBe('caida');
      expect(bogCaida).toBe('caida');
      expect(utcSana).toBe('sana');
      expect(bogSana).toBe('sana');
    } finally {
      process.env.TZ = original;
    }
  });

  it('acepta las dos formas en que una marca de tiempo llega desde la base', () => {
    // PostgREST devuelve la forma ISO con `T` y desfase (`…T18:00:00+00:00`),
    // pero un diagnostico por `psql` o un RPC que devuelva texto entrega la
    // forma con espacio (`… 18:00:00+00`). Las dos tienen que dar lo mismo, o
    // el panel se cae con `NaN` el dia que alguien cambie de ruta de lectura.
    expect(estadoDeSincronizacion('2026-09-02T16:00:00+00:00', AHORA)).toBe('sana');
    expect(estadoDeSincronizacion('2026-09-02 16:00:00+00', AHORA)).toBe('sana');
    expect(estadoDeSincronizacion('2026-09-02T10:00:00+00:00', AHORA)).toBe('caida');
    expect(estadoDeSincronizacion('2026-09-02 10:00:00+00', AHORA)).toBe('caida');
  });

  it('una marca ilegible se lee como CAIDA, no como sana', () => {
    // Falla CERRADO. Una marca que no se puede interpretar es una senal de que
    // algo va mal, y el modo de fallo seguro es alertar de mas, no callar.
    // Escrita al reves —`NaN` comparado con `<` da false, luego "sana"— el
    // panel pintaria verde justo cuando la lectura esta rota.
    expect(estadoDeSincronizacion('no es una fecha', AHORA)).toBe('caida');
    expect(estadoDeSincronizacion('', AHORA)).toBe('caida');
  });

  it('una marca en el futuro no se lee como caida', () => {
    // Un reloj de la base adelantado unos segundos respecto al del servidor
    // web es normal. Con una resta sin `Math.abs` esto ya funciona; la
    // asercion existe para que nadie "arregle" el signo mas adelante.
    expect(estadoDeSincronizacion(haceMinutos(-5), AHORA)).toBe('sana');
  });
});
