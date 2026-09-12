import { describe, expect, it } from 'vitest';

import { BUCKET_EVIDENCIA, rutaDeEvidencia, type TipoDeEvidencia } from './nombres';

describe('rutaDeEvidencia: la ruta la decide el servidor', () => {
  it('tiene exactamente tres segmentos y acaba en .jpg', () => {
    const r = rutaDeEvidencia('11111111-1111-4111-8111-111111111111', 'checklist');
    const partes = r.split('/');
    expect(partes).toHaveLength(3);
    expect(partes[0]).toBe('11111111-1111-4111-8111-111111111111');
    expect(partes[1]).toBe('checklist');
    expect(partes[2]).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  });

  it('dos llamadas iguales dan rutas DISTINTAS: cada foto es un archivo', () => {
    const a = rutaDeEvidencia('aseo', 'dano');
    const b = rutaDeEvidencia('aseo', 'dano');
    expect(a).not.toBe(b);
  });

  it('el bucket es el privado que creo la migracion 10', () => {
    expect(BUCKET_EVIDENCIA).toBe('evidencia');
  });

  describe('ningun byte del cliente entra en la ruta', () => {
    /**
     * El identificador del aseo lo valida el servidor ANTES de llamar aqui, y el
     * tipo es una union cerrada. Aun asi, se prueba con entrada hostil: si
     * algun dia alguien pasa algo sin validar, el test dice que la forma de la
     * ruta cambia.
     */
    it('una entrada con barras y puntos dobles NO produce una ruta de tres segmentos', () => {
      const hostil = '../../otro-aseo/../..';
      const r = rutaDeEvidencia(hostil, 'checklist');
      // La funcion no sanea: lo que hace el test es DEMOSTRAR que sanear es
      // responsabilidad del llamador, y que si no lo hace el resultado deja de
      // tener tres segmentos. Es el contrato, escrito como asercion.
      expect(r.split('/').length).toBeGreaterThan(3);
    });

    it('con un identificador ya validado, la ruta es exactamente de tres segmentos', () => {
      const r = rutaDeEvidencia('22222222-2222-4222-8222-222222222222', 'gasto');
      expect(r.split('/')).toHaveLength(3);
    });
  });

  it('cubre los cuatro tipos del CHECK de la tabla', () => {
    const tipos: TipoDeEvidencia[] = ['checklist', 'dano', 'gasto', 'faltante'];
    for (const t of tipos) {
      expect(rutaDeEvidencia('aseo', t).split('/')[1]).toBe(t);
    }
  });

  it('un tipo fuera de los cuatro no compila', () => {
    // @ts-expect-error 'otro' no es uno de los cuatro del CHECK de la tabla.
    rutaDeEvidencia('aseo', 'otro');
  });
});
