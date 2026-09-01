import { describe, expect, it } from 'vitest';

import {
  contarActivos,
  listarAseadoresConAsignaciones,
  type AseadorConAsignaciones,
} from './aseadores';

/**
 * `contarActivos` es una funcion pura sobre la forma que devuelve la consulta, asi
 * que se prueba con objetos armados a mano y sin base. Lo que decide es si el
 * dialogo de baja del plan 02-09 muestra su bloque ambar: si cuenta de mas, el
 * admin ve una alarma falsa; si cuenta de menos, desactiva a alguien creyendo que
 * no deja apartamentos huerfanos.
 */
function aseador(parcial: Partial<AseadorConAsignaciones> = {}): AseadorConAsignaciones {
  return {
    id: 'id-1',
    full_name: 'María Gómez',
    phone: null,
    is_active: true,
    responsableDe: [],
    suplenteEn: [],
    ...parcial,
  };
}

describe('contarActivos', () => {
  it('cuenta solo los apartamentos activos donde es responsable', () => {
    const a = aseador({
      responsableDe: [
        { id: 'p1', nombre: 'Bogotá 1', activo: true },
        { id: 'p2', nombre: 'Bogotá 2', activo: false },
        { id: 'p3', nombre: 'Bogotá 3', activo: true },
      ],
    });

    expect(contarActivos(a)).toBe(2);
  });

  it('devuelve 0 cuando no es responsable de ningún apartamento', () => {
    expect(contarActivos(aseador())).toBe(0);
  });

  it('devuelve 0 cuando ninguno de los apartamentos está activo', () => {
    const a = aseador({
      responsableDe: [
        { id: 'p1', nombre: 'Bogotá 1', activo: false },
        { id: 'p2', nombre: 'Bogotá 2', activo: false },
      ],
    });

    expect(contarActivos(a)).toBe(0);
  });

  it('NO cuenta los apartamentos donde solo es suplente', () => {
    // El bloque ambar del dialogo de baja habla de apartamentos que quedan SIN
    // responsable. Un apartamento donde la persona es suplente conserva a su
    // responsable, asi que no entra en ese conteo aunque este activo.
    const a = aseador({
      suplenteEn: [
        { id: 'p9', nombre: 'Cartagena 1', activo: true },
        { id: 'p8', nombre: 'Cartagena 2', activo: true },
      ],
    });

    expect(contarActivos(a)).toBe(0);
  });
});

/**
 * Doble del cliente de PostgREST: solo implementa el encadenamiento que usa
 * `listarAseadoresConAsignaciones`, y devuelve por tabla lo que se le siembre.
 *
 * Se prueba con un doble y no contra la base porque lo que este test mide es el
 * AGRUPADO en memoria, no la RLS. La RLS ya tiene sus pruebas de pgTAP, y un test
 * que sembrara con el mismo cliente con el que comprueba pasaria igual con la
 * policy mal escrita.
 *
 * ATENCION AL DETALLE QUE PARECE DE ADORNO: el doble APLICA de verdad los `.eq()`
 * que reciba, en vez de ignorarlos y devolver siempre la semilla entera. La
 * primera version los ignoraba y el test "un aseador desactivado sigue en la
 * lista" era un FALSO VERDE: pasaba igual con un `.eq('is_active', true)` metido
 * en la consulta, que es exactamente el bug que dice vigilar. Comprobado con
 * senuelo en los dos sentidos antes de darlo por bueno.
 */
function clienteFalso(datos: {
  profiles: Record<string, unknown>[];
  properties: Record<string, unknown>[];
}): Parameters<typeof listarAseadoresConAsignaciones>[0] {
  const constructor = (tabla: 'profiles' | 'properties') => {
    let filas = datos[tabla];

    const resolver = () => Promise.resolve({ data: filas, error: null });

    const encadenable = {
      select: () => encadenable,
      eq: (columna: string, valor: unknown) => {
        filas = filas.filter((f) => f[columna] === valor);
        return encadenable;
      },
      order: (columna: string) => {
        filas = [...filas].sort((a, b) =>
          String(a[columna]).localeCompare(String(b[columna]), 'es'),
        );
        return resolver();
      },
      then: (...args: Parameters<Promise<unknown>['then']>) => resolver().then(...args),
    };

    return encadenable;
  };

  return { from: constructor } as unknown as Parameters<
    typeof listarAseadoresConAsignaciones
  >[0];
}

describe('listarAseadoresConAsignaciones', () => {
  const APARTAMENTOS = [
    { id: 'p1', nombre: 'Bogotá 1', is_active: true, responsable_id: 'a1', suplente_id: 'a2' },
    { id: 'p2', nombre: 'Bogotá 2', is_active: false, responsable_id: 'a1', suplente_id: null },
    { id: 'p3', nombre: 'Cartagena 1', is_active: true, responsable_id: 'a2', suplente_id: 'a1' },
    { id: 'p4', nombre: 'Sin asignar', is_active: true, responsable_id: null, suplente_id: null },
  ];

  // El admin entra en la semilla A PROPOSITO: la consulta tiene que filtrarlo por
  // `role`, y el doble aplica los `.eq()` de verdad, asi que si el filtro
  // desaparece este test se pone rojo.
  const PERFILES = [
    { id: 'a1', full_name: 'Ana Ruiz', phone: '3001234567', is_active: true, role: 'aseador' },
    { id: 'a2', full_name: 'Beto Páez', phone: null, is_active: false, role: 'aseador' },
    { id: 'ad', full_name: 'Álvaro Admin', phone: null, is_active: true, role: 'admin' },
  ];

  it('agrupa cada apartamento bajo su responsable y su suplente', async () => {
    const [ana, beto] = await listarAseadoresConAsignaciones(
      clienteFalso({ profiles: PERFILES, properties: APARTAMENTOS }),
    );

    expect(ana.responsableDe.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(ana.suplenteEn.map((p) => p.id)).toEqual(['p3']);
    expect(beto.responsableDe.map((p) => p.id)).toEqual(['p3']);
    expect(beto.suplenteEn.map((p) => p.id)).toEqual(['p1']);
  });

  it('un aseador desactivado sigue en la lista, no desaparece', async () => {
    const aseadores = await listarAseadoresConAsignaciones(
      clienteFalso({ profiles: PERFILES, properties: APARTAMENTOS }),
    );

    expect(aseadores).toHaveLength(2);
    expect(aseadores.find((a) => a.id === 'a2')?.is_active).toBe(false);
  });

  it('deja fuera a quien no tiene rol de aseador', async () => {
    const aseadores = await listarAseadoresConAsignaciones(
      clienteFalso({ profiles: PERFILES, properties: APARTAMENTOS }),
    );

    expect(aseadores.map((a) => a.id)).not.toContain('ad');
  });

  it('ordena por nombre', async () => {
    const aseadores = await listarAseadoresConAsignaciones(
      clienteFalso({ profiles: PERFILES, properties: APARTAMENTOS }),
    );

    expect(aseadores.map((a) => a.full_name)).toEqual(['Ana Ruiz', 'Beto Páez']);
  });

  it('conserva los nombres de los apartamentos, no solo el conteo', async () => {
    // El Popover de UI-SPEC §11.1 lista los nombres al hacer clic. Devolver un
    // numero obligaria a una segunda consulta por aseador para poder abrirlo.
    const [ana] = await listarAseadoresConAsignaciones(
      clienteFalso({ profiles: PERFILES, properties: APARTAMENTOS }),
    );

    expect(ana.responsableDe).toEqual([
      { id: 'p1', nombre: 'Bogotá 1', activo: true },
      { id: 'p2', nombre: 'Bogotá 2', activo: false },
    ]);
  });

  it('deja las listas vacías para un aseador sin ninguna asignación', async () => {
    const aseadores = await listarAseadoresConAsignaciones(
      clienteFalso({
        profiles: [
          { id: 'a9', full_name: 'Zoe Nieto', phone: null, is_active: true, role: 'aseador' },
        ],
        properties: APARTAMENTOS,
      }),
    );

    expect(aseadores[0].responsableDe).toEqual([]);
    expect(aseadores[0].suplenteEn).toEqual([]);
  });

  it('propaga el error de PostgREST en vez de devolver una lista vacía', async () => {
    // Tragarse el error y devolver `[]` pinta el estado vacio "Todavia no hay
    // aseadores" cuando lo que pasa es que la RLS devolvio 42501. El admin
    // concluiria que se le borraron las cuentas.
    const cliente = {
      from: () => {
        const resultado = Promise.resolve({
          data: null,
          error: { message: 'permission denied for table profiles', code: '42501' },
        });
        const encadenable = {
          select: () => encadenable,
          eq: () => encadenable,
          order: () => resultado,
          then: resultado.then.bind(resultado),
        };
        return encadenable;
      },
    } as unknown as Parameters<typeof listarAseadoresConAsignaciones>[0];

    await expect(listarAseadoresConAsignaciones(cliente)).rejects.toThrow(/permission denied/);
  });
});
