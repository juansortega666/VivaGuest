import { describe, expect, it } from 'vitest';

import type { Tables } from '@/lib/database.types';

import {
  type ApartamentoInput,
  esquemaActivar,
  esquemaBorrador,
  faltantesParaActivar,
  valoresDesdeFilaGuardada,
} from './apartamento.schema';

const UID_A = '11111111-1111-4111-8111-111111111111';
const UID_B = '22222222-2222-4222-8222-222222222222';

/** Lo mínimo que la UI exige para un borrador gestionado. */
const borradorGestionada = {
  nombre: 'Apto 101',
  cluster: 'Laureles',
  gestion_vivaguest: true,
  fee_discriminado: false,
  hora_limite: '11:30',
};

/** Lo mínimo que la UI exige para un borrador informativo (gestión externa). */
const borradorInformativa = {
  ...borradorGestionada,
  gestion_vivaguest: false,
};

/** Gestionada lista para activar: tarifa + pago + responsable. */
const gestionadaCompleta = {
  ...borradorGestionada,
  tarifa_huesped: 320_000,
  pago_aseador: 60_000,
  responsable_id: UID_A,
};

/** Informativa lista para activar: contacto externo con contenido. */
const informativaCompleta = {
  ...borradorInformativa,
  contacto_externo: 'Marcela, 300 123 4567',
};

describe('esquemaBorrador', () => {
  it('acepta el mínimo: nombre, cluster, gestion_vivaguest, fee_discriminado y hora_limite', () => {
    expect(esquemaBorrador.safeParse(borradorGestionada).success).toBe(true);
  });

  it('acepta un borrador gestionado sin tarifas ni responsable (se guarda incompleto)', () => {
    const r = esquemaBorrador.safeParse({
      ...borradorGestionada,
      tarifa_huesped: null,
      pago_aseador: null,
      responsable_id: null,
    });
    expect(r.success).toBe(true);
  });

  it('rechaza un nombre vacío', () => {
    expect(
      esquemaBorrador.safeParse({ ...borradorGestionada, nombre: '' }).success,
    ).toBe(false);
  });

  it('rechaza un nombre que solo tiene espacios', () => {
    expect(
      esquemaBorrador.safeParse({ ...borradorGestionada, nombre: '   ' }).success,
    ).toBe(false);
  });

  it('rechaza responsable_id en una unidad de gestión externa (props_assignees_only_when_managed)', () => {
    const r = esquemaBorrador.safeParse({
      ...borradorInformativa,
      responsable_id: UID_A,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'responsable_id')).toBe(true);
  });

  it('rechaza suplente_id en una unidad de gestión externa', () => {
    expect(
      esquemaBorrador.safeParse({ ...borradorInformativa, suplente_id: UID_A })
        .success,
    ).toBe(false);
  });

  it('rechaza suplente igual al responsable (props_suplente_distinct)', () => {
    const r = esquemaBorrador.safeParse({
      ...borradorGestionada,
      responsable_id: UID_A,
      suplente_id: UID_A,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'suplente_id')).toBe(true);
  });

  it('acepta suplente distinto del responsable', () => {
    expect(
      esquemaBorrador.safeParse({
        ...borradorGestionada,
        responsable_id: UID_A,
        suplente_id: UID_B,
      }).success,
    ).toBe(true);
  });

  it('rechaza hora_limite con formato distinto de HH:MM', () => {
    for (const hora of ['11', '11:3', '1130', '11:30:00', 'once y media', '']) {
      expect(
        esquemaBorrador.safeParse({ ...borradorGestionada, hora_limite: hora })
          .success,
      ).toBe(false);
    }
  });

  it('rechaza una hora con formato HH:MM pero fuera de rango', () => {
    // `properties.hora_limite` es `time`: un 99:99 no daría un 23514 legible sino
    // un error de parseo crudo de Postgres. Se corta antes del submit.
    for (const hora of ['24:00', '99:99', '12:60']) {
      expect(
        esquemaBorrador.safeParse({ ...borradorGestionada, hora_limite: hora })
          .success,
      ).toBe(false);
    }
  });

  it('rechaza una tarifa negativa (props_rates_nonneg)', () => {
    expect(
      esquemaBorrador.safeParse({ ...borradorGestionada, tarifa_huesped: -1 })
        .success,
    ).toBe(false);
  });

  it('rechaza un pago al aseador negativo (props_rates_nonneg)', () => {
    expect(
      esquemaBorrador.safeParse({ ...borradorGestionada, pago_aseador: -50 })
        .success,
    ).toBe(false);
  });

  it('trata el string vacío de un campo de dinero como ausencia, no como cero', () => {
    // Un input numérico vacío llega como '' desde react-hook-form. Sin esta
    // normalización, `z.coerce.number()` lo volvería 0 y la unidad se activaría
    // con "tarifa 0" en vez de bloquear la activación.
    const r = esquemaBorrador.safeParse({
      ...borradorGestionada,
      tarifa_huesped: '',
    });
    expect(r.success).toBe(true);
    expect(r.data?.tarifa_huesped).toBeNull();
  });
});

describe('esquemaActivar — unidad gestionada', () => {
  it('rechaza activar sin tarifa al huésped', () => {
    const r = esquemaActivar.safeParse({
      ...gestionadaCompleta,
      tarifa_huesped: null,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'tarifa_huesped')).toBe(true);
  });

  it('rechaza activar sin pago al aseador', () => {
    const r = esquemaActivar.safeParse({
      ...gestionadaCompleta,
      pago_aseador: null,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'pago_aseador')).toBe(true);
  });

  it('rechaza activar sin aseador responsable', () => {
    const r = esquemaActivar.safeParse({
      ...gestionadaCompleta,
      responsable_id: null,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'responsable_id')).toBe(true);
  });

  it('acepta una gestionada completa', () => {
    expect(esquemaActivar.safeParse(gestionadaCompleta).success).toBe(true);
  });

  it('no acepta contacto_externo como sustituto del responsable, aunque la base sí lo haría', () => {
    // props_active_requires_owner acepta `responsable_id IS NOT NULL OR
    // contacto_externo IS NOT NULL`. La UI aprieta más a propósito (APTO-08).
    const r = esquemaActivar.safeParse({
      ...gestionadaCompleta,
      responsable_id: null,
      contacto_externo: 'Alguien más',
    });
    expect(r.success).toBe(false);
  });
});

describe('esquemaActivar — unidad informativa', () => {
  it('rechaza activar sin contacto externo', () => {
    const r = esquemaActivar.safeParse(borradorInformativa);
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'contacto_externo')).toBe(
      true,
    );
  });

  it('rechaza un contacto externo que solo tiene espacios', () => {
    const r = esquemaActivar.safeParse({
      ...borradorInformativa,
      contacto_externo: '   ',
    });
    expect(r.success).toBe(false);
  });

  it('acepta una informativa con contacto', () => {
    expect(esquemaActivar.safeParse(informativaCompleta).success).toBe(true);
  });

  it('no le exige tarifas ni responsable a una informativa', () => {
    expect(esquemaActivar.safeParse(informativaCompleta).success).toBe(true);
  });
});

describe('faltantesParaActivar', () => {
  it('devuelve los 3 ítems en el orden Tarifa → Pago → Responsable para una gestionada vacía', () => {
    expect(faltantesParaActivar(borradorGestionada)).toEqual([
      { campo: 'tarifa_huesped', etiqueta: 'Tarifa al huésped' },
      { campo: 'pago_aseador', etiqueta: 'Pago al aseador' },
      { campo: 'responsable_id', etiqueta: 'Aseador responsable' },
    ]);
  });

  it('devuelve [] para una gestionada completa', () => {
    expect(faltantesParaActivar(gestionadaCompleta)).toEqual([]);
  });

  it('devuelve exactamente 1 ítem (contacto_externo) para una informativa sin contacto', () => {
    expect(faltantesParaActivar(borradorInformativa)).toEqual([
      { campo: 'contacto_externo', etiqueta: 'Contacto externo' },
    ]);
  });

  it('devuelve [] para una informativa con contacto', () => {
    expect(faltantesParaActivar(informativaCompleta)).toEqual([]);
  });

  it('no cuenta un contacto de solo espacios como contacto', () => {
    expect(
      faltantesParaActivar({ ...borradorInformativa, contacto_externo: '  ' }),
    ).toHaveLength(1);
  });

  it('trata el string vacío de un campo de dinero como faltante', () => {
    const f = faltantesParaActivar({
      ...gestionadaCompleta,
      tarifa_huesped: '',
    });
    expect(f).toEqual([{ campo: 'tarifa_huesped', etiqueta: 'Tarifa al huésped' }]);
  });

  it('acepta cero como valor presente: 0 no es un faltante', () => {
    expect(
      faltantesParaActivar({ ...gestionadaCompleta, pago_aseador: 0 }),
    ).toEqual([]);
  });

  it('tolera un objeto parcial sin gestion_vivaguest sin lanzar', () => {
    expect(() => faltantesParaActivar({})).not.toThrow();
  });
});

describe('faltantesParaActivar y esquemaActivar no se pueden desincronizar', () => {
  // La lista "Para activar falta" de UI-SPEC §8.2 y el `disabled` del botón salen
  // de la MISMA regla. Este test es el que impide que alguien duplique el `if`.
  const escenarios: ReadonlyArray<readonly [string, Partial<ApartamentoInput>]> = [
    ['gestionada vacía', borradorGestionada],
    ['gestionada completa', gestionadaCompleta],
    ['gestionada sin tarifa', { ...gestionadaCompleta, tarifa_huesped: null }],
    ['gestionada sin pago', { ...gestionadaCompleta, pago_aseador: null }],
    ['gestionada sin responsable', { ...gestionadaCompleta, responsable_id: null }],
    ['gestionada con tarifa vacía', { ...gestionadaCompleta, tarifa_huesped: '' }],
    ['informativa sin contacto', borradorInformativa],
    ['informativa con contacto', informativaCompleta],
    [
      'informativa con contacto en blanco',
      { ...borradorInformativa, contacto_externo: '   ' },
    ],
  ];

  it.each(escenarios)('coinciden en el veredicto: %s', (_nombre, valor) => {
    const puedeActivarSegunLista = faltantesParaActivar(valor).length === 0;
    const puedeActivarSegunEsquema = esquemaActivar.safeParse(valor).success;
    expect(puedeActivarSegunLista).toBe(puedeActivarSegunEsquema);
  });
});

describe('valoresDesdeFilaGuardada', () => {
  /** Una fila de `properties` tal como la devuelve PostgREST, lista para activar. */
  function filaGuardada(sobre: Partial<Tables<'properties'>> = {}): Tables<'properties'> {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      nombre: 'Apto 101',
      cluster: 'Laureles',
      direccion: null,
      maps_url: null,
      maps_lat: null,
      maps_lng: null,
      // `time` de Postgres: PostgREST la serializa CON segundos.
      hora_limite: '11:30:00',
      gestion_vivaguest: true,
      tarifa_huesped: 320_000,
      pago_aseador: 60_000,
      fee_discriminado: false,
      responsable_id: UID_A,
      suplente_id: null,
      contacto_externo: null,
      is_active: false,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      ...sobre,
    };
  }

  it('recorta los segundos de hora_limite: HH:MM:SS -> HH:MM', () => {
    expect(valoresDesdeFilaGuardada(filaGuardada()).hora_limite).toBe('11:30');
  });

  it('una fila completa pasa esquemaActivar', () => {
    // ESTA ES LA ASERCIÓN QUE PROTEGE LA FUNCIONALIDAD ENTERA. Sin el recorte de
    // los segundos, `RE_HORA` rechaza '11:30:00' y NINGÚN apartamento del
    // catálogo se puede activar desde el menú de la tabla, con un mensaje sobre
    // el formato de la hora que no explica nada.
    const resultado = esquemaActivar.safeParse(valoresDesdeFilaGuardada(filaGuardada()));

    expect(resultado.success).toBe(true);
  });

  it('CONTROL: la misma fila SIN recortar los segundos NO pasa', () => {
    // El control demuestra que el test de arriba mide el recorte y no otra cosa.
    const crudo = { ...valoresDesdeFilaGuardada(filaGuardada()), hora_limite: '11:30:00' };
    const resultado = esquemaActivar.safeParse(crudo);

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual(['hora_limite']);
  });

  it('una fila incompleta falla por el campo que le falta, no por la hora', () => {
    const resultado = esquemaActivar.safeParse(
      valoresDesdeFilaGuardada(filaGuardada({ responsable_id: null })),
    );

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual(['responsable_id']);
  });

  it('una informativa sin contacto falla por contacto_externo', () => {
    // La puerta que NO tiene 23514 detrás: `props_active_requires_owner` está
    // condicionado a `gestion_vivaguest`, así que para una unidad informativa la
    // base dejaría activar sin contacto. Esta revalidación es la única red.
    const resultado = esquemaActivar.safeParse(
      valoresDesdeFilaGuardada(
        filaGuardada({
          gestion_vivaguest: false,
          tarifa_huesped: null,
          pago_aseador: null,
          responsable_id: null,
          contacto_externo: null,
        }),
      ),
    );

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual(['contacto_externo']);
  });
});
