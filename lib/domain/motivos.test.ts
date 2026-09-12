import { describe, expect, it } from 'vitest';

import { Constants } from '@/lib/database.types';

import {
  ETIQUETAS_NO_PUEDO,
  ETIQUETAS_SKIP,
  MOTIVOS_NO_PUEDO,
  MOTIVOS_SKIP,
  exigeNota,
} from './motivos';

describe('ETIQUETAS_SKIP está anclada al enum de la base', () => {
  /**
   * La aserción recorre el enum GENERADO, no un arreglo escrito a mano. Es lo
   * que hace que añadir un motivo en la migración rompa aquí en vez de
   * renderizar una cadena vacía en el teléfono de la aseadora.
   */
  const delEnum = Constants.public.Enums.motivo_sin_evidencia;

  it('cubre exactamente los valores del enum, ni uno más ni uno menos', () => {
    expect(Object.keys(ETIQUETAS_SKIP).sort()).toEqual([...delEnum].sort());
  });

  it('el orden de presentación contiene los mismos valores que el enum', () => {
    expect([...MOTIVOS_SKIP].sort()).toEqual([...delEnum].sort());
  });

  it('ninguna etiqueta está vacía', () => {
    for (const [clave, etiqueta] of Object.entries(ETIQUETAS_SKIP)) {
      expect(etiqueta.trim().length, `etiqueta de ${clave}`).toBeGreaterThan(0);
    }
  });

  it('otro va último: es el cajón de sastre, no la primera opción', () => {
    expect(MOTIVOS_SKIP[MOTIVOS_SKIP.length - 1]).toBe('otro');
  });
});

describe('ETIQUETAS_NO_PUEDO', () => {
  it('cubre exactamente los cuatro motivos declarados', () => {
    expect(Object.keys(ETIQUETAS_NO_PUEDO).sort()).toEqual([...MOTIVOS_NO_PUEDO].sort());
  });

  it('ninguna etiqueta está vacía y otro va último', () => {
    for (const etiqueta of Object.values(ETIQUETAS_NO_PUEDO)) {
      expect(etiqueta.trim().length).toBeGreaterThan(0);
    }
    expect(MOTIVOS_NO_PUEDO[MOTIVOS_NO_PUEDO.length - 1]).toBe('otro');
  });
});

describe('exigeNota', () => {
  it('solo otro exige explicación', () => {
    expect(exigeNota('otro')).toBe(true);
    for (const m of MOTIVOS_SKIP.filter((x) => x !== 'otro')) {
      expect(exigeNota(m), `motivo ${m}`).toBe(false);
    }
  });

  it('vale para las dos listas: otro es otro en las dos', () => {
    expect(exigeNota('enfermo')).toBe(false);
    expect(exigeNota('apto_no_disponible')).toBe(false);
  });
});

describe('ninguna etiqueta usa jerga prohibida por §14 del contrato', () => {
  const prohibidas = ['PWA', 'service worker', 'suscripción', 'push', 'offline', 'sincroniz'];

  it('ni las del skip ni las del no puedo', () => {
    const todas = [...Object.values(ETIQUETAS_SKIP), ...Object.values(ETIQUETAS_NO_PUEDO)];
    for (const etiqueta of todas) {
      for (const palabra of prohibidas) {
        expect(etiqueta.toLowerCase(), `"${etiqueta}"`).not.toContain(palabra.toLowerCase());
      }
    }
  });
});
