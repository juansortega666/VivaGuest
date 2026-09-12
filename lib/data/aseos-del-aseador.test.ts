import { describe, expect, it, vi } from 'vitest';

import {
  esVisibleEnElHome,
  leerAseosDeHoy,
  ordenarParaElHome,
  type FilaDeAseoDelAseador,
} from './aseos-del-aseador';

vi.mock('@/lib/domain/dates', async (original) => ({
  ...(await original<typeof import('@/lib/domain/dates')>()),
  hoyBog: () => '2026-09-12',
}));

const HOY = '2026-09-12';
const MANANA = '2026-09-13';

function aseo(over: Partial<FilaDeAseoDelAseador> & { id: string }): FilaDeAseoDelAseador {
  return {
    scheduled_date: HOY,
    state: 'pendiente',
    hora_limite: '11:30:00',
    is_managed: true,
    num_huespedes: 2,
    property: { id: 'p1', nombre: 'Bogotá 3', cluster: 'Chapinero' },
    ...over,
  };
}

function clienteFalso(filas: FilaDeAseoDelAseador[]) {
  const capturado: { gte?: string; lte?: string } = {};
  const cadena = {
    select: () => cadena,
    gte: (_c: string, v: string) => {
      capturado.gte = v;
      return cadena;
    },
    lte: (_c: string, v: string) => {
      capturado.lte = v;
      return Promise.resolve({ data: filas, error: null });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { cliente: { from: () => cadena } as any, capturado };
}

describe('la ventana es hoy y manana, y nada mas', () => {
  it('consulta desde hoy hasta manana', async () => {
    const { cliente, capturado } = clienteFalso([]);
    await leerAseosDeHoy(cliente, 0);
    expect(capturado.gte).toBe(HOY);
    expect(capturado.lte).toBe(MANANA);
  });

  it('los de manana se CUENTAN pero no entran a la lista', async () => {
    const { cliente } = clienteFalso([
      aseo({ id: 'a', scheduled_date: HOY }),
      aseo({ id: 'b', scheduled_date: MANANA }),
      aseo({ id: 'c', scheduled_date: MANANA }),
    ]);
    const r = await leerAseosDeHoy(cliente, 0);
    expect(r.deHoy.map((x) => x.id)).toEqual(['a']);
    expect(r.conteoDeManana).toBe(2);
  });

  it('devuelve una sola marca de tiempo, la que recibe', async () => {
    const { cliente } = clienteFalso([]);
    const r = await leerAseosDeHoy(cliente, 1_757_000_000_000);
    expect(r.leidoEnMs).toBe(1_757_000_000_000);
    expect(r.hoy).toBe(HOY);
  });
});

describe('ordenarParaElHome: lo que pasa AHORA va arriba', () => {
  it('el en_curso va primero aunque su hora limite sea mas tarde', () => {
    const filas = [
      aseo({ id: 'temprano', state: 'pendiente', hora_limite: '09:00:00' }),
      aseo({ id: 'en-curso', state: 'en_curso', hora_limite: '17:00:00' }),
    ];
    // Ordenar SOLO por hora limite mandaria hacia abajo el aseo que la aseadora
    // tiene abierto, que es justo el que buscaba al abrir la app.
    expect(ordenarParaElHome(filas).map((f) => f.id)).toEqual(['en-curso', 'temprano']);
  });

  it('dentro del mismo estado, por hora limite ascendente', () => {
    const filas = [
      aseo({ id: 'tarde', hora_limite: '15:00:00' }),
      aseo({ id: 'temprano', hora_limite: '09:00:00' }),
    ];
    expect(ordenarParaElHome(filas).map((f) => f.id)).toEqual(['temprano', 'tarde']);
  });

  it('desempata por nombre con localeCompare, no con comparacion de puntos de codigo', () => {
    const filas = [
      aseo({ id: 'z', property: { id: 'p', nombre: 'Zipaquirá', cluster: 'c' } }),
      aseo({ id: 'a', property: { id: 'p', nombre: 'Álamos', cluster: 'c' } }),
    ];
    expect(ordenarParaElHome(filas).map((f) => f.id)).toEqual(['a', 'z']);
  });

  it('los terminados van al final pero NO desaparecen', () => {
    const filas = [
      aseo({ id: 'hecho', state: 'completada', hora_limite: '08:00:00' }),
      aseo({ id: 'pendiente', state: 'pendiente', hora_limite: '18:00:00' }),
    ];
    const r = ordenarParaElHome(filas);
    expect(r.map((f) => f.id)).toEqual(['pendiente', 'hecho']);
    expect(r).toHaveLength(2);
  });
});

describe('esVisibleEnElHome', () => {
  it('un aseo cancelado no se muestra: no hay nada que hacer con el', () => {
    expect(esVisibleEnElHome(aseo({ id: 'x', state: 'cancelada' }))).toBe(false);
  });

  it('una unidad de gestion externa no se muestra', () => {
    expect(esVisibleEnElHome(aseo({ id: 'x', is_managed: false, state: null }))).toBe(false);
  });

  it('pendiente, en curso y completada si se muestran', () => {
    for (const s of ['pendiente', 'en_curso', 'completada'] as const) {
      expect(esVisibleEnElHome(aseo({ id: 'x', state: s })), s).toBe(true);
    }
  });
});

describe('la RLS es la frontera y NO se duplica aqui', () => {
  it('la funcion no filtra por aseador: con filas ajenas en el doble, las devuelve', async () => {
    // Es correcto y esta escrito en la cabecera del modulo: la policy
    // `cleanings_cleaner_select` ya lo hace. Un segundo filtro en TypeScript
    // seria un segundo sitio donde equivocarse.
    const { cliente } = clienteFalso([
      aseo({ id: 'mio' }),
      aseo({ id: 'ajeno' }),
    ]);
    const r = await leerAseosDeHoy(cliente, 0);
    expect(r.deHoy).toHaveLength(2);
  });
});
