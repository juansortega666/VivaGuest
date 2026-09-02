import { describe, expect, it } from 'vitest';

import {
  estadoDeApartamento,
  filtrarApartamentos,
  normalizar,
  resumenDelCatalogo,
  type EntradaEstadoApartamento,
  type EntradaFiltroApartamento,
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

/* ═══════════════════════════════════════════════════════════════════════════
   FILTRADO Y CONTEOS DE LA TABLA — plan 02-11

   LA REGLA DE ESTE BLOQUE, heredada de los planes 02-09 y 02-10: un fixture
   donde TODAS las filas comparten el rasgo que se mide no prueba nada. Un test
   de "aparece Incompleta" pasa igual si el filtro devuelve las 39 filas sin
   mirarlas. Por eso cada caso lleva delante un CONTROL que demuestra que el
   fixture discrimina: que la fila excluida SI aparece cuando se quita el
   criterio, y que el conteo esperado NO coincide con el total.
   ═══════════════════════════════════════════════════════════════════════════ */

const RESPONSABLE = '8f2d1e40-0000-4000-8000-000000000001';

/**
 * Catalogo de prueba con LOS CUATRO ESTADOS y DOS clusters, uno de ellos con
 * tilde. Cada fila esta ahi por una razon distinta, y ninguna es redundante.
 */
const CATALOGO: EntradaFiltroApartamento[] = [
  {
    // ACTIVA, en el cluster con tilde. Es la que prueba el buscador sin tildes.
    nombre: 'Bogotá 1 — Apto 01',
    cluster: 'Bogotá 1',
    responsableNombre: 'Ana Ramírez',
    contacto_externo: null,
    gestion_vivaguest: true,
    is_active: true,
    tarifa_huesped: 120000,
    pago_aseador: 45000,
    responsable_id: RESPONSABLE,
  },
  {
    // INCOMPLETA, mismo cluster con tilde.
    nombre: 'Bogotá 1 — Apto 02',
    cluster: 'Bogotá 1',
    responsableNombre: null,
    contacto_externo: null,
    gestion_vivaguest: true,
    is_active: false,
    tarifa_huesped: null,
    pago_aseador: null,
    responsable_id: null,
  },
  {
    // INACTIVA: gestionada, apagada y COMPLETA. La cuarta etiqueta.
    nombre: 'Cartagena — Casa 01',
    cluster: 'Cartagena',
    responsableNombre: 'Ana Ramírez',
    contacto_externo: null,
    gestion_vivaguest: true,
    is_active: false,
    tarifa_huesped: 200000,
    pago_aseador: 70000,
    responsable_id: RESPONSABLE,
  },
  {
    // INFORMATIVA, y con el contacto externo que la columna RESPONSABLE pinta.
    nombre: 'Chinauta — Casa 01',
    cluster: 'Chinauta',
    responsableNombre: null,
    contacto_externo: 'Limpian los propietarios',
    gestion_vivaguest: false,
    is_active: false,
    tarifa_huesped: null,
    pago_aseador: null,
    responsable_id: null,
  },
];

/** Atajo de lectura: los nombres que sobrevivieron al filtro. */
function nombres(filas: EntradaFiltroApartamento[]): string[] {
  return filas.map((f) => f.nombre);
}

const SIN_FILTRO = { busqueda: '', cluster: null, soloPendientes: false } as const;

describe('filtrarApartamentos', () => {
  it('CONTROL: sin ningun criterio devuelve las cuatro filas', () => {
    // Si este control fallara, todos los conteos de abajo perderian su
    // referencia y un filtro que devuelve la lista entera pasaria por bueno.
    expect(filtrarApartamentos(CATALOGO, SIN_FILTRO)).toHaveLength(4);
  });

  it("escribir 'bogota' encuentra las dos de 'Bogotá 1', y NO las otras dos", () => {
    const encontradas = filtrarApartamentos(CATALOGO, { ...SIN_FILTRO, busqueda: 'bogota' });

    // Las dos mitades importan. Solo la primera pasaria con un filtro que no
    // filtra; solo la segunda pasaria con uno que no devuelve nada.
    expect(nombres(encontradas)).toEqual(['Bogotá 1 — Apto 01', 'Bogotá 1 — Apto 02']);
    expect(encontradas).toHaveLength(2);
    expect(encontradas.length).toBeLessThan(CATALOGO.length);
  });

  it('CONTROL del anterior: un termino que no existe devuelve cero', () => {
    // Sin este control, "encuentra 2 de 4" pasaria tambien con un buscador que
    // ignora el termino y siempre corta por la mitad.
    expect(filtrarApartamentos(CATALOGO, { ...SIN_FILTRO, busqueda: 'medellin' })).toEqual([]);
  });

  it('busca tambien por el nombre del responsable, sin tilde', () => {
    const encontradas = filtrarApartamentos(CATALOGO, { ...SIN_FILTRO, busqueda: 'ramirez' });

    // 'Ana Ramírez' es responsable de dos filas de CLUSTERS DISTINTOS: asi el
    // caso no se puede confundir con una coincidencia por cluster.
    expect(nombres(encontradas)).toEqual(['Bogotá 1 — Apto 01', 'Cartagena — Casa 01']);
  });

  it('en una informativa busca por el contacto externo, que es lo que la columna ensena', () => {
    const encontradas = filtrarApartamentos(CATALOGO, {
      ...SIN_FILTRO,
      busqueda: 'propietarios',
    });

    expect(nombres(encontradas)).toEqual(['Chinauta — Casa 01']);
  });

  it('el contacto externo de una GESTIONADA no es buscable: la columna no lo ensena', () => {
    const gestionadaConContacto: EntradaFiltroApartamento[] = [
      { ...CATALOGO[0], contacto_externo: 'Limpian los propietarios' },
    ];

    // CONTROL: la misma fila, con la misma cadena, SI se encuentra cuando es
    // informativa. Sin el, este `toEqual([])` pasaria aunque el buscador
    // estuviera roto del todo.
    expect(
      filtrarApartamentos([{ ...gestionadaConContacto[0], gestion_vivaguest: false }], {
        ...SIN_FILTRO,
        busqueda: 'propietarios',
      }),
    ).toHaveLength(1);

    expect(
      filtrarApartamentos(gestionadaConContacto, { ...SIN_FILTRO, busqueda: 'propietarios' }),
    ).toEqual([]);
  });

  it('los criterios se combinan con Y, no con O', () => {
    // CONTROL en dos mitades: cada criterio POR SEPARADO devuelve filas.
    expect(
      filtrarApartamentos(CATALOGO, { ...SIN_FILTRO, busqueda: 'bogota' }),
    ).toHaveLength(2);
    expect(
      filtrarApartamentos(CATALOGO, { ...SIN_FILTRO, cluster: 'Cartagena' }),
    ).toHaveLength(1);

    // Y JUNTOS dan cero. Con un `||` en vez de un `&&` esto daria 3.
    expect(
      filtrarApartamentos(CATALOGO, {
        busqueda: 'bogota',
        cluster: 'Cartagena',
        soloPendientes: false,
      }),
    ).toEqual([]);
  });

  it('el filtro de cluster compara con trim: un espacio de mas no crea un cluster nuevo', () => {
    const conEspacio = [{ ...CATALOGO[2], cluster: 'Cartagena  ' }];

    expect(
      nombres(filtrarApartamentos(conEspacio, { ...SIN_FILTRO, cluster: 'Cartagena' })),
    ).toEqual(['Cartagena — Casa 01']);
  });

  it('soloPendientes deja Incompleta e Inactiva, y saca Activa e Informativa', () => {
    const pendientes = filtrarApartamentos(CATALOGO, { ...SIN_FILTRO, soloPendientes: true });

    // Se comprueban las CUATRO filas por su nombre, no solo el conteo: con un
    // `!is_active` a secas la informativa se colaria y el conteo seria 3, pero
    // un assert de "menos de 4" pasaria igual.
    expect(nombres(pendientes)).toEqual(['Bogotá 1 — Apto 02', 'Cartagena — Casa 01']);
    expect(nombres(pendientes)).not.toContain('Chinauta — Casa 01');
    expect(nombres(pendientes)).not.toContain('Bogotá 1 — Apto 01');
  });

  it('no muta ni reordena la lista que recibe', () => {
    const original = nombres(CATALOGO);
    filtrarApartamentos(CATALOGO, { ...SIN_FILTRO, busqueda: 'cartagena' });
    expect(nombres(CATALOGO)).toEqual(original);
  });
});

describe('resumenDelCatalogo', () => {
  it('el denominador del banner son las GESTIONADAS, no el total', () => {
    const resumen = resumenDelCatalogo(CATALOGO);

    // CONTROL: el fixture tiene informativas. Sin esta linea, `gestionadas === 4`
    // pasaria con una funcion que devolviera `filas.length` y nadie lo notaria.
    expect(resumen.informativas).toBe(1);
    expect(resumen.total).toBe(4);
    expect(resumen.gestionadas).toBe(3);
    expect(resumen.gestionadas).not.toBe(resumen.total);
  });

  it('listas cuenta solo las gestionadas ACTIVAS, y pendientes es el resto', () => {
    const resumen = resumenDelCatalogo(CATALOGO);

    expect(resumen.listas).toBe(1);
    expect(resumen.pendientes).toBe(2);
    expect(resumen.listas + resumen.pendientes).toBe(resumen.gestionadas);
  });

  it('el dia uno del catalogo real: 39 unidades, 34 gestionadas, cero listas', () => {
    // La semilla de la Fase 1 son 39 filas con tarifas nulas e is_active false.
    // El banner arranca en `0 de 34`, no en `6 de 34` como el ejemplo del spec.
    const semilla: EntradaEstadoApartamento[] = [
      ...Array.from({ length: 34 }, () => ({
        gestion_vivaguest: true,
        is_active: false,
        tarifa_huesped: null,
        pago_aseador: null,
        responsable_id: null,
      })),
      ...Array.from({ length: 5 }, () => ({
        gestion_vivaguest: false,
        is_active: false,
        tarifa_huesped: null,
        pago_aseador: null,
        responsable_id: null,
      })),
    ];

    const resumen = resumenDelCatalogo(semilla);

    expect(resumen.total).toBe(39);
    expect(resumen.gestionadas).toBe(34);
    expect(resumen.informativas).toBe(5);
    expect(resumen.listas).toBe(0);
    expect(resumen.pendientes).toBe(34);
  });

  it('un catalogo sin ninguna gestionada no divide por cero: gestionadas es 0', () => {
    const resumen = resumenDelCatalogo([CATALOGO[3]]);

    expect(resumen.gestionadas).toBe(0);
    expect(resumen.pendientes).toBe(0);
  });
});
