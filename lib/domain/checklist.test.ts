import { describe, expect, it } from 'vitest';

import {
  armarChecklist,
  cuartoCompleto,
  cuartoNecesitaFoto,
  faltaEvidenciaEnCuarto,
  primerCuartoIncompleto,
  progresoDeCuarto,
  progresoTotal,
  sinEvidenciaCompleta,
  type FilaDeChecklist,
  type FilaDeSkip,
  type FotoDeChecklist,
} from './checklist';

/**
 * El riesgo lógico de la Fase 6 vive aquí: si el checklist se arma mal, la
 * aseadora ve cuartos que no existen o no ve los que sí. Es CHECK-01 literal.
 */

const COCINA = 'e0000000-0000-0000-0000-000000000001';
const BANO = 'e0000000-0000-0000-0000-000000000002';
const SALA = 'e0000000-0000-0000-0000-000000000003';

function tarea(over: Partial<FilaDeChecklist> & { id: string }): FilaDeChecklist {
  return {
    property_room_id: COCINA,
    room_label: 'Cocina',
    task_label: 'Tarea',
    requiere_foto: false,
    sort_order: 100,
    done_at: null,
    ...over,
  };
}

/** Tres cuartos: cocina (1 tarea con foto), baño (2, una con foto), sala (1 sin foto). */
function tresCuartos(): FilaDeChecklist[] {
  return [
    tarea({ id: 't1', property_room_id: COCINA, room_label: 'Cocina', task_label: 'Estufa', requiere_foto: true, sort_order: 101 }),
    tarea({ id: 't2', property_room_id: BANO, room_label: 'Baño principal', task_label: 'Sanitario', requiere_foto: true, sort_order: 201 }),
    tarea({ id: 't3', property_room_id: BANO, room_label: 'Baño principal', task_label: 'Toallas', requiere_foto: false, sort_order: 202 }),
    tarea({ id: 't4', property_room_id: SALA, room_label: 'Sala', task_label: 'Barrer', requiere_foto: false, sort_order: 301 }),
  ];
}

describe('armarChecklist: CHECK-01, solo los cuartos de ese apartamento', () => {
  it('CHECK-01: tres cuartos producen TRES grupos, no uno por tarea', () => {
    const grupos = armarChecklist(tresCuartos());
    expect(grupos).toHaveLength(3);
    expect(grupos.map((g) => g.propertyRoomId)).toEqual([COCINA, BANO, SALA]);
  });

  it('CHECK-01: no inventa ningún grupo con la entrada vacía', () => {
    expect(armarChecklist([])).toEqual([]);
  });

  it('agrupa las dos tareas del baño en un solo grupo', () => {
    const bano = armarChecklist(tresCuartos()).find((g) => g.propertyRoomId === BANO);
    expect(bano?.tareas.map((t) => t.task_label)).toEqual(['Sanitario', 'Toallas']);
  });

  it('ordena las tareas del cuarto por sort_order, no por el orden de llegada', () => {
    const revueltas = [
      tarea({ id: 'b', property_room_id: BANO, room_label: 'Baño', task_label: 'Segunda', sort_order: 202 }),
      tarea({ id: 'a', property_room_id: BANO, room_label: 'Baño', task_label: 'Primera', sort_order: 201 }),
    ];
    expect(armarChecklist(revueltas)[0].tareas.map((t) => t.task_label)).toEqual([
      'Primera',
      'Segunda',
    ]);
  });

  it('desempata con localeCompare y no con comparación de puntos de código', () => {
    const mismas = [
      tarea({ id: 'z', property_room_id: SALA, room_label: 'Zipaquirá', sort_order: 500 }),
      tarea({ id: 'a', property_room_id: COCINA, room_label: 'Álamos', sort_order: 500 }),
    ];
    // Con `<` a secas, 'Álamos' iría DESPUÉS de 'Zipaquirá'.
    expect(armarChecklist(mismas).map((g) => g.etiqueta)).toEqual(['Álamos', 'Zipaquirá']);
  });

  it('muestra la etiqueta de SNAPSHOT, no un nombre resuelto de otra parte', () => {
    const renombrado = [
      tarea({ id: 't', property_room_id: COCINA, room_label: 'Cocina vieja', sort_order: 101 }),
    ];
    expect(armarChecklist(renombrado)[0].etiqueta).toBe('Cocina vieja');
  });

  it('le pega a cada cuarto su skip, con el motivo, y deja el resto en null', () => {
    const skips: FilaDeSkip[] = [
      { property_room_id: BANO, room_label: 'Baño principal', motivo: 'cuarto_cerrado', nota: null },
    ];
    const grupos = armarChecklist(tresCuartos(), skips);
    expect(grupos.find((g) => g.propertyRoomId === BANO)?.saltado?.motivo).toBe('cuarto_cerrado');
    expect(grupos.find((g) => g.propertyRoomId === COCINA)?.saltado).toBeNull();
  });
});

describe('progreso', () => {
  it('cuenta las hechas y el total, y no devuelve porcentaje', () => {
    const grupos = armarChecklist([
      tarea({ id: 'a', property_room_id: BANO, room_label: 'Baño', sort_order: 201, done_at: '2026-09-12T10:00:00Z' }),
      tarea({ id: 'b', property_room_id: BANO, room_label: 'Baño', sort_order: 202 }),
    ]);
    expect(progresoDeCuarto(grupos[0])).toEqual({ hechas: 1, total: 2 });
  });

  it('un cuarto sin tareas cuenta como completo y no divide por cero', () => {
    const vacio = { propertyRoomId: SALA, etiqueta: 'Sala', tareas: [], saltado: null };
    expect(progresoDeCuarto(vacio)).toEqual({ hechas: 0, total: 0 });
    expect(cuartoCompleto(vacio)).toBe(true);
  });

  it('el total suma, no promedia porcentajes', () => {
    const grupos = armarChecklist([
      tarea({ id: 'a', property_room_id: COCINA, room_label: 'Cocina', sort_order: 101, done_at: 'x' }),
      tarea({ id: 'b', property_room_id: BANO, room_label: 'Baño', sort_order: 201 }),
      tarea({ id: 'c', property_room_id: BANO, room_label: 'Baño', sort_order: 202 }),
    ]);
    // Promediando porcentajes daría 50%; sumando es 1 de 3.
    expect(progresoTotal(grupos)).toEqual({ hechas: 1, total: 3 });
  });
});

describe('cuartoNecesitaFoto: la traducción de D-05', () => {
  it('el cuarto necesita foto si ALGUNA de sus tareas la exige', () => {
    const grupos = armarChecklist(tresCuartos());
    expect(cuartoNecesitaFoto(grupos.find((g) => g.propertyRoomId === BANO)!)).toBe(true);
  });

  it('el cuarto NO necesita foto si ninguna de sus tareas la exige', () => {
    const grupos = armarChecklist(tresCuartos());
    expect(cuartoNecesitaFoto(grupos.find((g) => g.propertyRoomId === SALA)!)).toBe(false);
  });
});

describe('sinEvidenciaCompleta: paridad con la función de SQL', () => {
  const fotosDeTodas: FotoDeChecklist[] = [
    { checklist_item_id: 't1' },
    { checklist_item_id: 't2' },
  ];

  it('caso 1 de 4: todo marcado y todas las fotos -> NO está sin evidencia', () => {
    const grupos = armarChecklist(tresCuartos(), [], fotosDeTodas);
    expect(sinEvidenciaCompleta(grupos, fotosDeTodas)).toBe(false);
  });

  it('caso 2 de 4: un cuarto saltado -> SÍ está sin evidencia, aunque haya todas las fotos', () => {
    const skips: FilaDeSkip[] = [
      { property_room_id: SALA, room_label: 'Sala', motivo: 'sin_luz', nota: null },
    ];
    const grupos = armarChecklist(tresCuartos(), skips, fotosDeTodas);
    expect(sinEvidenciaCompleta(grupos, fotosDeTodas)).toBe(true);
  });

  it('caso 3 de 4: una tarea que exige foto sin foto -> SÍ está sin evidencia', () => {
    const grupos = armarChecklist(tresCuartos(), [], [{ checklist_item_id: 't1' }]);
    expect(sinEvidenciaCompleta(grupos, [{ checklist_item_id: 't1' }])).toBe(true);
  });

  it('caso 4 de 4: un cuarto sin foto que TAMPOCO la necesitaba -> NO está sin evidencia', () => {
    // La sala no exige foto. Si esta aserción falla, la función confunde "no
    // tiene foto" con "le falta foto", que son cosas distintas.
    const soloSala = [tarea({ id: 't4', property_room_id: SALA, room_label: 'Sala', requiere_foto: false, sort_order: 301 })];
    expect(sinEvidenciaCompleta(armarChecklist(soloSala), [])).toBe(false);
  });

  it('una foto con vínculo nulo no cuenta como evidencia de ninguna tarea', () => {
    const grupos = armarChecklist(tresCuartos());
    expect(faltaEvidenciaEnCuarto(grupos[0], [{ checklist_item_id: null }])).toBe(true);
  });
});

describe('primerCuartoIncompleto', () => {
  it('devuelve el primero con tareas pendientes, en el orden del acordeón', () => {
    const filas = tresCuartos().map((t) =>
      t.property_room_id === COCINA ? { ...t, done_at: 'x' } : t,
    );
    expect(primerCuartoIncompleto(armarChecklist(filas))).toBe(BANO);
  });

  it('devuelve null cuando todos están completos', () => {
    const filas = tresCuartos().map((t) => ({ ...t, done_at: 'x' }));
    expect(primerCuartoIncompleto(armarChecklist(filas))).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA DIVERGENCIA QUE ENCONTRO EL TEST DE PARIDAD — plan 06-10
//
// Agrupando SOLO por las filas del checklist, el salto de un cuarto que no tiene
// ninguna tarea se quedaba sin grupo al que pegarse y desaparecia. El sintoma no
// era cosmetico: el dashboard del admin marcaba el aseo como sin evidencia
// completa y la pantalla de la aseadora decia que estaba completo, sobre EL
// MISMO aseo. Nadie mira las dos a la vez, asi que habria vivido ahi.
// ════════════════════════════════════════════════════════════════════════════

describe('un cuarto saltado sin ninguna tarea', () => {
  const HUESPEDES = 'e0000000-0000-0000-0000-000000000009';

  const skipHuerfano = {
    property_room_id: HUESPEDES,
    room_label: 'Cuarto de huéspedes',
    motivo: 'cuarto_cerrado' as const,
    nota: null,
  };

  it('genera su propio grupo, con su etiqueta de snapshot', () => {
    const grupos = armarChecklist(tresCuartos(), [skipHuerfano]);

    const suyo = grupos.find((g) => g.propertyRoomId === HUESPEDES);
    expect(suyo).toBeDefined();
    expect(suyo?.etiqueta).toBe('Cuarto de huéspedes');
    expect(suyo?.tareas).toHaveLength(0);
    expect(suyo?.saltado?.motivo).toBe('cuarto_cerrado');
  });

  it('hace que el aseo cuente como SIN evidencia completa', () => {
    // Es la asercion que espeja a `public.aseo_sin_evidencia_completa()`, que
    // pregunta por la tabla de saltos sin importarle si el cuarto tiene tareas.
    const grupos = armarChecklist(tresCuartos(), [skipHuerfano]);
    expect(sinEvidenciaCompleta(grupos, [])).toBe(true);
  });

  it('va al FINAL del acordeón, no al principio', () => {
    // Con el orden por defecto caeria arriba del todo, que es el peor sitio: lo
    // primero que veria la aseadora al abrir el aseo seria un cuarto en el que
    // no hay nada que hacer.
    const grupos = armarChecklist(tresCuartos(), [skipHuerfano]);
    expect(grupos[grupos.length - 1].propertyRoomId).toBe(HUESPEDES);
  });

  it('no altera el orden de los cuartos que sí tienen tareas', () => {
    const conSkip = armarChecklist(tresCuartos(), [skipHuerfano]);
    const sinSkip = armarChecklist(tresCuartos());

    expect(conSkip.slice(0, sinSkip.length).map((g) => g.propertyRoomId)).toEqual(
      sinSkip.map((g) => g.propertyRoomId),
    );
  });
});
