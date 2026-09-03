import { describe, expect, it } from 'vitest';

import {
  CHK_PROFILES_DEACTIVATION_COHERENT,
  CHK_PROPERTY_SECRETS_TIPO_CERRADURA_VALIDO,
  CHK_PROPS_ACTIVE_REQUIRES_OWNER,
  CHK_PROPS_ACTIVE_REQUIRES_RATES,
  CHK_PROPS_ASSIGNEES_ONLY_WHEN_MANAGED,
  CHK_PROPS_RATES_NONNEG,
  CHK_PROPS_SUPLENTE_DISTINCT,
  CHK_UNMANAGED_IS_INERT,
  IDX_CALENDAR_FEEDS_PROP_PROVIDER_UNIQ,
  IDX_MIC_GLOBAL_UNIQ,
  IDX_MIC_PROP_UNIQ,
  IDX_ONE_ACTIVE_PER_PROPERTY_DATE,
  IDX_ONE_LIVE_PER_RESERVATION,
  IDX_PROPERTIES_NOMBRE_UNIQ,
  IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ,
} from './constants';
import { campoDeConstraint, mapAuthError, mapDbError } from './errors';

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

// ---------------------------------------------------------------------------
// Fase 2: los constraints que el CRUD del catálogo puede disparar.
// ---------------------------------------------------------------------------

const chk = (relacion: string, constraint: string) =>
  `new row for relation "${relacion}" violates check constraint "${constraint}"`;

describe('mapDbError — CHECK de la Fase 2', () => {
  it('traduce props_active_requires_rates', () => {
    expect(
      mapDbError({
        code: '23514',
        message: chk('properties', CHK_PROPS_ACTIVE_REQUIRES_RATES),
      }),
    ).toBe('No se puede activar sin tarifa al huésped y pago al aseador.');
  });

  it('traduce props_active_requires_owner', () => {
    expect(
      mapDbError({
        code: '23514',
        message: chk('properties', CHK_PROPS_ACTIVE_REQUIRES_OWNER),
      }),
    ).toBe('No se puede activar sin un aseador responsable.');
  });

  it('traduce props_assignees_only_when_managed', () => {
    expect(
      mapDbError({
        code: '23514',
        message: chk('properties', CHK_PROPS_ASSIGNEES_ONLY_WHEN_MANAGED),
      }),
    ).toBe('Una unidad de gestión externa no lleva responsable ni suplente.');
  });

  it('traduce props_suplente_distinct', () => {
    expect(
      mapDbError({
        code: '23514',
        message: chk('properties', CHK_PROPS_SUPLENTE_DISTINCT),
      }),
    ).toBe('El suplente no puede ser la misma persona que el responsable.');
  });

  it('traduce props_rates_nonneg', () => {
    expect(
      mapDbError({
        code: '23514',
        message: chk('properties', CHK_PROPS_RATES_NONNEG),
      }),
    ).toBe('Las tarifas no pueden ser negativas.');
  });

  it('traduce profiles_deactivation_coherent', () => {
    expect(
      mapDbError({
        code: '23514',
        message: chk('profiles', CHK_PROFILES_DEACTIVATION_COHERENT),
      }),
    ).toBe('Estado de activación incoherente.');
  });

  it('traduce property_secrets_tipo_cerradura_valido', () => {
    expect(
      mapDbError({
        code: '23514',
        message: chk(
          'property_secrets',
          CHK_PROPERTY_SECRETS_TIPO_CERRADURA_VALIDO,
        ),
      }),
    ).toBe('Tipo de cerradura inválido.');
  });

  it('nunca deja pasar el texto crudo del constraint a la pantalla', () => {
    const msg = mapDbError({
      code: '23514',
      message: chk('properties', CHK_PROPS_ACTIVE_REQUIRES_RATES),
    });
    expect(msg).not.toContain('props_active_requires_rates');
    expect(msg).not.toContain('check constraint');
  });
});

describe('mapDbError — UNIQUE de la Fase 2', () => {
  it('traduce property_rooms_etiqueta_uniq', () => {
    expect(
      mapDbError({ code: '23505', message: dup(IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ) }),
    ).toBe('Ya existe un cuarto con esa etiqueta en este apartamento.');
  });

  it('traduce mic_prop_uniq', () => {
    expect(mapDbError({ code: '23505', message: dup(IDX_MIC_PROP_UNIQ) })).toBe(
      'Ya existe un faltante con ese nombre.',
    );
  });

  it('traduce mic_global_uniq', () => {
    expect(mapDbError({ code: '23505', message: dup(IDX_MIC_GLOBAL_UNIQ) })).toBe(
      'Ya existe un faltante con ese nombre.',
    );
  });

  it('traduce calendar_feeds_prop_provider_uniq', () => {
    expect(
      mapDbError({
        code: '23505',
        message: dup(IDX_CALENDAR_FEEDS_PROP_PROVIDER_UNIQ),
      }),
    ).toBe('Este apartamento ya tiene un calendario de ese proveedor.');
  });
});

describe('mapAuthError', () => {
  it('da el mismo mensaje para password mala y email inexistente (sin enumeración)', () => {
    expect(mapAuthError({ code: 'invalid_credentials', status: 400 })).toBe(
      'Email o contraseña incorrectos.',
    );
  });

  it('traduce user_banned', () => {
    expect(mapAuthError({ code: 'user_banned', status: 400 })).toBe(
      'Tu cuenta está desactivada. Contacta al administrador.',
    );
  });

  it('traduce email_exists', () => {
    expect(mapAuthError({ code: 'email_exists', status: 422 })).toBe(
      'Ya existe una cuenta con ese email.',
    );
  });

  it('traduce over_request_rate_limit', () => {
    expect(mapAuthError({ code: 'over_request_rate_limit', status: 429 })).toBe(
      'Demasiados intentos. Espera unos minutos.',
    );
  });

  it('devuelve el genérico ante un código desconocido, sin lanzar', () => {
    let msg = '';
    expect(() => {
      msg = mapAuthError({ code: 'algo_desconocido', message: 'Something failed' });
    }).not.toThrow();
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toContain('algo_desconocido');
  });

  it('nunca devuelve el message crudo de GoTrue, que viene en inglés', () => {
    const crudo = 'Invalid login credentials';
    expect(mapAuthError({ message: crudo })).not.toContain(crudo);
    expect(mapAuthError({ code: 'weak_password', message: crudo })).not.toContain(
      crudo,
    );
  });

  it('no lanza con un objeto vacío', () => {
    expect(() => mapAuthError({})).not.toThrow();
    expect(mapAuthError({}).length).toBeGreaterThan(0);
  });
});

describe('campoDeConstraint', () => {
  it('enruta props_active_requires_rates a tarifa_huesped', () => {
    expect(
      campoDeConstraint(chk('properties', CHK_PROPS_ACTIVE_REQUIRES_RATES)),
    ).toBe('tarifa_huesped');
  });

  it('enruta props_active_requires_owner a responsable_id', () => {
    expect(
      campoDeConstraint(chk('properties', CHK_PROPS_ACTIVE_REQUIRES_OWNER)),
    ).toBe('responsable_id');
  });

  it('enruta props_suplente_distinct a suplente_id', () => {
    expect(campoDeConstraint(chk('properties', CHK_PROPS_SUPLENTE_DISTINCT))).toBe(
      'suplente_id',
    );
  });

  it('enruta property_rooms_etiqueta_uniq a etiqueta', () => {
    expect(campoDeConstraint(dup(IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ))).toBe(
      'etiqueta',
    );
  });

  it('enruta properties_nombre_uniq a nombre', () => {
    expect(campoDeConstraint(dup(IDX_PROPERTIES_NOMBRE_UNIQ))).toBe('nombre');
  });

  it('devuelve undefined ante un mensaje que no reconoce (va a toast)', () => {
    expect(campoDeConstraint('cualquier cosa')).toBeUndefined();
  });

  it('devuelve undefined sin message', () => {
    expect(campoDeConstraint(undefined)).toBeUndefined();
  });

  it('no enruta a un campo un error que no tiene campo en pantalla', () => {
    // `profiles_deactivation_coherent` es un bug interno: no hay input que marcar.
    expect(
      campoDeConstraint(chk('profiles', CHK_PROFILES_DEACTIVATION_COHERENT)),
    ).toBeUndefined();
  });
});
