import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { contarPorClasificacion, esHtml, evaluarLectura, hayColapso } from './ical-guardas';
import { normalizarIcs } from './ical-normalizar';

function fixture(nombre: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./__fixtures__/ical/${nombre}`, import.meta.url)),
    'utf8',
  );
}

const ICAL = 'text/calendar; charset=utf-8';

describe('esHtml', () => {
  it('reconoce el tipo base ignorando los parametros', () => {
    expect(esHtml('text/html')).toBe(true);
    expect(esHtml('text/html; charset=utf-8')).toBe(true);
    expect(esHtml('TEXT/HTML')).toBe(true);
    expect(esHtml(ICAL)).toBe(false);
    expect(esHtml(null)).toBe(false);
  });
});

describe('evaluarLectura, el camino feliz', () => {
  it('el feed real da quince eventos, quince reservas y ningun desconocido', () => {
    const r = evaluarLectura({
      contentType: ICAL,
      cuerpo: fixture('airbnb-real-anonimizado.ics'),
      reservasAnteriores: 15,
    });

    expect(r.usable).toBe(true);
    expect(r.conteos).toEqual({
      event_count: 15,
      reservation_count: 15,
      block_count: 0,
      unknown_count: 0,
    });
  });

  it('un feed sin ninguna reserva previa y sin eventos es utilizable, no un colapso', () => {
    // Un apartamento recien conectado y sin reservas. Fallar aqui bloquearia el
    // alta de cualquier feed nuevo.
    const r = evaluarLectura({
      contentType: ICAL,
      cuerpo: fixture('vacio.ics'),
      reservasAnteriores: 0,
    });

    expect(r.usable).toBe(true);
    expect(r.conteos?.event_count).toBe(0);
  });
});

describe('las guardas de transporte sobre el cuerpo', () => {
  it('una pagina de error HTML con 200 no es una lectura utilizable', () => {
    const r = evaluarLectura({
      contentType: 'text/html; charset=utf-8',
      cuerpo: fixture('html-200.html'),
      reservasAnteriores: 15,
    });

    expect(r.usable).toBe(false);
    expect(r).toMatchObject({ motivo: 'content_type_html' });
  });

  it('sin Content-Type que lo delate, el mismo HTML cae por el sniff de cabecera', () => {
    // El proveedor puede mandar la pagina de error con un tipo cualquiera. La
    // segunda guarda no depende de la cabecera.
    const r = evaluarLectura({
      contentType: null,
      cuerpo: fixture('html-200.html'),
      reservasAnteriores: 15,
    });

    expect(r).toMatchObject({ usable: false, motivo: 'no_es_ical' });
  });

  it('EL SNIFF DE CABECERA NO BASTA: el cuerpo truncado lo pasa y la guarda de cierre lo atrapa', () => {
    const cuerpo = fixture('airbnb-truncado.ics');

    // Control positivo del enunciado: el archivo SI abre calendario, asi que la
    // validacion de la Fase 2 lo habria dado por bueno. Sin esta linea, la
    // asercion de abajo no demuestra nada.
    expect(cuerpo).toContain('BEGIN:VCALENDAR');
    expect(cuerpo).not.toContain('END:VCALENDAR');

    const r = evaluarLectura({ contentType: ICAL, cuerpo, reservasAnteriores: 15 });

    expect(r).toMatchObject({ usable: false, motivo: 'cuerpo_truncado' });
    // Y no llega a contar nada: no se puede concluir la ausencia de una reserva
    // a partir de media respuesta.
    expect(r.conteos).toBeNull();
  });
});

describe('LA GUARDA DE COLAPSO, y el senuelo que prueba que mira lo que debe', () => {
  const mutilado = fixture('airbnb-desc-mutilado.ics');

  it('el feed con el DESCRIPTION cambiado NO es una lectura utilizable', () => {
    const r = evaluarLectura({ contentType: ICAL, cuerpo: mutilado, reservasAnteriores: 15 });

    expect(r).toMatchObject({ usable: false, motivo: 'cero_reservas_clasificadas' });
    // La telemetria del colapso, que es la senal temprana del Pitfall 5:
    // quince eventos, cero reservas, quince desconocidos.
    expect(r.conteos).toEqual({
      event_count: 15,
      reservation_count: 0,
      block_count: 0,
      unknown_count: 15,
    });
  });

  it('SENUELO: la guarda por CONTEO DE EVENTOS deja pasar el mismo cuerpo', () => {
    const eventos = normalizarIcs(mutilado);
    const conteos = contarPorClasificacion(eventos);
    const reservasAnteriores = 15;

    // La version del diseno previo (`ARCHITECTURE.md` paso 7), escrita aqui tal
    // cual para que la comparacion sea explicita y no una nota en un resumen.
    const guardaPorEventos = eventos.length === 0 && reservasAnteriores > 0;

    // NO SALTA. Los quince eventos siguen llegando.
    expect(guardaPorEventos).toBe(false);
    expect(eventos).toHaveLength(15);

    // La guarda buena SI salta, sobre el mismo cuerpo y el mismo conteo previo.
    expect(hayColapso(conteos, reservasAnteriores)).toBe(true);

    // Traducido: con la guarda por eventos, este cuerpo llega al RPC, las quince
    // reservas se marcan ausentes y dos corridas despues se cancelan los quince
    // aseos del apartamento.
    expect(guardaPorEventos).not.toBe(hayColapso(conteos, reservasAnteriores));
  });

  it('el colapso total por SUMMARY desconocido tambien salta', () => {
    const r = evaluarLectura({
      contentType: ICAL,
      cuerpo: fixture('airbnb-summary-desconocido.ics'),
      reservasAnteriores: 3,
    });

    expect(r).toMatchObject({ usable: false, motivo: 'cero_reservas_clasificadas' });
    expect(r.conteos).toMatchObject({ event_count: 3, reservation_count: 0, unknown_count: 3 });
  });

  it('sin reservas ANTERIORES no hay colapso: un apartamento vacio no es un feed roto', () => {
    const r = evaluarLectura({ contentType: ICAL, cuerpo: mutilado, reservasAnteriores: 0 });

    // Se deja pasar a proposito. El RPC no puede cancelar nada que no exista, y
    // los quince desconocidos alertan por su cuenta.
    expect(r.usable).toBe(true);
  });

  it('LIMITE CONOCIDO: un feed que pasa a tener solo bloqueos del propietario se lee como colapso', () => {
    // No es un defecto que se pueda arreglar aqui sin abrir un agujero peor: con
    // cero reservas clasificadas es indistinguible de un cambio de formato. La
    // guarda falla CERRADO —no cancela nada— y alerta, que es la direccion
    // segura. El coste es una alerta falsa; el coste del otro lado es un mes de
    // aseos cancelados.
    const r = evaluarLectura({
      contentType: ICAL,
      cuerpo: fixture('solo-bloqueos.ics'),
      reservasAnteriores: 15,
    });

    expect(r).toMatchObject({ usable: false, motivo: 'cero_reservas_clasificadas' });
    // Y la bitacora lo distingue de un colapso de formato: aqui hay bloqueos
    // clasificados y cero desconocidos.
    expect(r.conteos?.block_count).toBeGreaterThan(0);
    expect(r.conteos?.unknown_count).toBe(0);
  });
});
