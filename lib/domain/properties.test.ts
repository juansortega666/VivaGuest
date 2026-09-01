import { describe, expect, it } from 'vitest';

import {
  estadoDeApartamento,
  normalizar,
  type EntradaEstadoApartamento,
} from './properties';

/** Fila gestionada, activa y completa. Cada caso muta solo lo que prueba. */
const base: EntradaEstadoApartamento = {
  gestion_vivaguest: true,
  is_active: true,
  tarifa_huesped: 120000,
  pago_aseador: 45000,
  responsable_id: '8f2d1e40-0000-4000-8000-000000000001',
};

describe('estadoDeApartamento', () => {
  it('informativa: gestion_vivaguest=false gana sobre todo lo demas', () => {
    expect(estadoDeApartamento({ ...base, gestion_vivaguest: false }).clave).toBe(
      'informativa',
    );
    // Una unidad externa con todo nulo y desactivada NO es incompleta: es informativa.
    expect(
      estadoDeApartamento({
        gestion_vivaguest: false,
        is_active: false,
        tarifa_huesped: null,
        pago_aseador: null,
        responsable_id: null,
      }).clave,
    ).toBe('informativa');
  });

  it('activa: gestionada y is_active', () => {
    expect(estadoDeApartamento(base).clave).toBe('activa');
  });

  it('incompleta: falta la tarifa del huesped', () => {
    expect(
      estadoDeApartamento({ ...base, is_active: false, tarifa_huesped: null }).clave,
    ).toBe('incompleta');
  });

  it('incompleta: falta el pago del aseador', () => {
    expect(
      estadoDeApartamento({ ...base, is_active: false, pago_aseador: null }).clave,
    ).toBe('incompleta');
  });

  it('incompleta: falta el responsable', () => {
    expect(
      estadoDeApartamento({ ...base, is_active: false, responsable_id: null }).clave,
    ).toBe('incompleta');
  });

  it('inactiva: la frontera. Gestionada, apagada, pero con tarifa, pago y responsable', () => {
    const estado = estadoDeApartamento({ ...base, is_active: false });
    expect(estado.clave).toBe('inactiva');
    expect(estado.clave).not.toBe('incompleta');
  });

  it('devuelve la etiqueta en espanol exacta de UI-SPEC §5', () => {
    expect(estadoDeApartamento(base).etiqueta).toBe('Activa');
    expect(estadoDeApartamento({ ...base, is_active: false }).etiqueta).toBe('Inactiva');
    expect(
      estadoDeApartamento({ ...base, is_active: false, pago_aseador: null }).etiqueta,
    ).toBe('Incompleta');
    expect(estadoDeApartamento({ ...base, gestion_vivaguest: false }).etiqueta).toBe(
      'Informativa',
    );
  });

  it('acepta un Pick parcial de la fila, no la fila entera de PostgREST', () => {
    // Es lo que permite llamarla con el estado en vivo del formulario (plan 02-09).
    const parcial: EntradaEstadoApartamento = {
      gestion_vivaguest: true,
      is_active: false,
      tarifa_huesped: null,
      pago_aseador: null,
      responsable_id: null,
    };
    expect(estadoDeApartamento(parcial).clave).toBe('incompleta');
  });

  it('no admite pago cero como faltante: 0 es un valor, null es la ausencia', () => {
    expect(
      estadoDeApartamento({
        ...base,
        is_active: false,
        tarifa_huesped: 0,
        pago_aseador: 0,
      }).clave,
    ).toBe('inactiva');
  });
});

describe('normalizar', () => {
  it("escribir 'bogota' encuentra 'Bogota 1' con tilde", () => {
    expect(normalizar('Bogotá 1')).toContain(normalizar('bogota'));
  });

  it('es insensible a mayusculas y a tildes a la vez', () => {
    expect(normalizar('BOGOTÁ')).toBe(normalizar('bogota'));
  });

  it('quita tambien la tilde de la enye', () => {
    expect(normalizar('Ñuñoa')).toBe('nunoa');
  });
});
