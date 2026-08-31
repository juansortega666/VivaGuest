import { describe, expect, it } from 'vitest';

import {
  CHK_UNMANAGED_IS_INERT,
  IDX_ONE_ACTIVE_PER_PROPERTY_DATE,
  IDX_ONE_LIVE_PER_RESERVATION,
  IDX_PROPERTIES_NOMBRE_UNIQ,
} from './constants';
import { mapDbError } from './errors';

const dup = (constraint: string) =>
  `duplicate key value violates unique constraint "${constraint}"`;

describe('mapDbError', () => {
  it('traduce el 23505 del indice de un aseo activo por apartamento y fecha (ASEO-07)', () => {
    const msg = mapDbError({
      code: '23505',
      message: dup(IDX_ONE_ACTIVE_PER_PROPERTY_DATE),
    });
    expect(msg).toBe('Ya existe un aseo activo para ese apartamento en esa fecha.');
  });

  it('da un mensaje distinto y especifico para el indice de un aseo vivo por reserva', () => {
    const msg = mapDbError({
      code: '23505',
      message: dup(IDX_ONE_LIVE_PER_RESERVATION),
    });
    expect(msg).toContain('reserva');
    expect(msg).not.toBe(
      mapDbError({ code: '23505', message: dup(IDX_ONE_ACTIVE_PER_PROPERTY_DATE) }),
    );
  });

  it('traduce el 23505 de nombre de apartamento duplicado', () => {
    const msg = mapDbError({
      code: '23505',
      message: dup(IDX_PROPERTIES_NOMBRE_UNIQ),
    });
    expect(msg).toContain('apartamento');
    expect(msg).toContain('nombre');
  });

  it('no filtra el recurso solicitado en el 42501', () => {
    const msg = mapDbError({
      code: '42501',
      message: 'permission denied for table property_secrets',
    });
    expect(msg.toLowerCase()).toContain('permiso');
    expect(msg).not.toContain('property_secrets');
    expect(msg.toLowerCase()).not.toContain('table');
  });

  it('traduce el CHECK de unidad de gestion externa', () => {
    const msg = mapDbError({
      code: '23514',
      message: `new row for relation "cleanings" violates check constraint "${CHK_UNMANAGED_IS_INERT}"`,
    });
    expect(msg.toLowerCase()).toContain('gestión externa');
  });

  it('devuelve un mensaje generico ante un codigo desconocido, sin lanzar', () => {
    let msg = '';
    expect(() => {
      msg = mapDbError({ code: 'XX999', message: 'internal error' });
    }).not.toThrow();
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toContain('XX999');
  });

  it('no lanza cuando el error no trae code', () => {
    expect(() => mapDbError({})).not.toThrow();
    expect(mapDbError({}).length).toBeGreaterThan(0);
  });

  it('propaga el mensaje de negocio que levanta un RPC con errcode P0001', () => {
    const msg = mapDbError({
      code: 'P0001',
      message: 'El aseo ya fue completado y no admite mas cambios.',
    });
    expect(msg).toBe('El aseo ya fue completado y no admite mas cambios.');
  });

  it('cae al generico si un 23505 no reconoce el nombre del indice', () => {
    const msg = mapDbError({ code: '23505', message: dup('indice_que_no_existe') });
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toContain('indice_que_no_existe');
  });

  it('no lanza si el 23505 viene sin message', () => {
    expect(() => mapDbError({ code: '23505' })).not.toThrow();
  });
});
