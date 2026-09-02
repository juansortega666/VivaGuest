import { describe, expect, test } from 'vitest';

import { listarClusters, type ApartamentoDeLista } from './apartamentos';

/**
 * Solo se prueba aqui `listarClusters`, que es la unica funcion PURA del modulo.
 * Las otras tres hablan con PostgREST y su comportamiento real (que columnas trae,
 * que ve cada rol) lo fija `lib/domain/apartamento.integration.test.ts` contra la
 * base viva. Un test con el cliente stubbeado solo comprobaria que el stub
 * devuelve lo que el stub devuelve.
 */

/** Fila minima: solo importa `cluster`, el resto es relleno tipado. */
function fila(cluster: string): ApartamentoDeLista {
  return {
    id: `id-${cluster}`,
    nombre: `Apto ${cluster}`,
    cluster,
    gestion_vivaguest: true,
    is_active: false,
    tarifa_huesped: null,
    pago_aseador: null,
    responsable_id: null,
    contacto_externo: null,
    responsableNombre: null,
    tieneCalendario: false,
  };
}

describe('listarClusters', () => {
  test('sobre clusters repetidos devuelve los distintos, ordenados', () => {
    const filas = [fila('Chapinero'), fila('Bogota 1'), fila('Chapinero'), fila('Armenia')];

    expect(listarClusters(filas)).toEqual(['Armenia', 'Bogota 1', 'Chapinero']);
  });

  test('normaliza por trim antes de deduplicar', () => {
    // `properties.cluster` es `text not null`, ni enum ni tabla: el combobox
    // admite entrada libre y un espacio de mas crea un cluster fantasma.
    const filas = [fila('Bogota 1'), fila('Bogota 1 '), fila(' Bogota 1')];

    expect(listarClusters(filas)).toEqual(['Bogota 1']);
  });

  test('sobre lista vacia devuelve []', () => {
    expect(listarClusters([])).toEqual([]);
  });

  test('ordena con las tildes en su sitio, no por punto de codigo', () => {
    // Un `sort()` a secas manda 'Bogotá' DESPUES de 'Zipaquira' porque 'á' esta
    // por encima de 'z' en UTF-16. En un filtro de 8 clusters eso se ve.
    const filas = [fila('Zipaquira'), fila('Bogota'), fila('Bogotá'), fila('Armenia')];

    expect(listarClusters(filas)).toEqual(['Armenia', 'Bogota', 'Bogotá', 'Zipaquira']);
  });

  test('descarta un cluster que solo tiene espacios', () => {
    // Tras el trim queda la cadena vacia. Una opcion en blanco en el combobox es
    // un item invisible que se puede seleccionar: mejor que no exista.
    const filas = [fila('Armenia'), fila('   ')];

    expect(listarClusters(filas)).toEqual(['Armenia']);
  });

  test('no muta la lista que recibe', () => {
    // Se ordena una copia: `filas` es el mismo array que pinta la tabla, y
    // reordenarlo por debajo cambiaria el orden de las filas en pantalla.
    const filas = [fila('Chapinero'), fila('Armenia')];
    const antes = filas.map((f) => f.cluster);

    listarClusters(filas);

    expect(filas.map((f) => f.cluster)).toEqual(antes);
  });
});
