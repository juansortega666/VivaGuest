import { describe, expect, test } from 'vitest';

import {
  fusionarTarifas,
  listarClusters,
  type ApartamentoDeLista,
  type TarifaDeApartamento,
} from './apartamentos';

/**
 * Aqui solo se prueban las funciones PURAS del modulo: `listarClusters` y
 * `fusionarTarifas`. Las que hablan con PostgREST y su comportamiento real (que
 * columnas trae, que ve cada rol) lo fija `lib/domain/apartamento.integration.test.ts`
 * contra la base viva. Un test con el cliente stubbeado solo comprobaria que el
 * stub devuelve lo que el stub devuelve.
 *
 * ESO VALE DOBLE PARA LA MIGRACION 24. Lo que esa migracion cambio es un GRANT
 * POR COLUMNA, y un doble de cliente NO TIENE PRIVILEGIOS: siempre acepta. Aqui
 * no se puede probar que la aseadora ya no lea la tarifa, y no se intenta. Eso
 * lo miden las aserciones 13 y 14 de `supabase/tests/11_financiero.test.sql`,
 * dentro de Postgres y con roles reales. Lo que SI se puede fijar sin base es la
 * COMPOSICION: que las dos cifras se peguen a la fila correcta y que una fila
 * sin cifras conocidas salga con las dos en `null` y no con `undefined`.
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

  test('ordena por collation es-CO y no por punto de codigo UTF-16', () => {
    // ESTE TEST SE ESCRIBIO DOS VECES, Y LA PRIMERA VERSION NO SERVIA.
    //
    // Decia `['Zipaquira','Bogota','Bogotá','Armenia'] -> ['Armenia','Bogota',
    // 'Bogotá','Zipaquira']` y pasaba TAMBIEN con un `sort()` a secas, porque
    // en ese juego de datos las dos ordenaciones coinciden: 'a'(U+0061) va
    // antes que 'á'(U+00E1) en puntos de codigo, y tambien antes por collation.
    // El senuelo de cambiar `localeCompare` por `sort()` salio VERDE.
    //
    // Los dos casos de abajo son los que de verdad discriminan:
    //
    //  1. MAYUSCULAS. `sort()` compara code units, y toda mayuscula ASCII
    //     (65..90) va antes que toda minuscula (97..122): 'Zipaquira' quedaria
    //     antes que 'chapinero'. El admin teclea el cluster a mano, asi que una
    //     minuscula inicial es un dato realista, no un caso de laboratorio.
    //  2. LA TILDE EN MEDIO. 'Bogotá 1' vs 'Bogota 2': por code unit gana
    //     'Bogota 2' (la 'a' pelada es menor que la 'á'); por collation es-CO la
    //     tilde es una diferencia terciaria y decide el digito, asi que gana
    //     'Bogotá 1'. Son ordenes OPUESTOS.
    const filas = [
      fila('Zipaquira'),
      fila('chapinero'),
      fila('Bogotá 1'),
      fila('Bogota 2'),
      fila('Armenia'),
    ];

    expect(listarClusters(filas)).toEqual([
      'Armenia',
      'Bogotá 1',
      'Bogota 2',
      'chapinero',
      'Zipaquira',
    ]);
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

describe('fusionarTarifas', () => {
  const cifras = (property_id: string, t: number | null, p: number | null): TarifaDeApartamento => ({
    property_id,
    tarifa_huesped: t,
    pago_aseador: p,
  });

  test('pega cada par de cifras a la fila de su mismo id', () => {
    const filas = [fila('Armenia'), fila('Chapinero')];
    const tarifas = [cifras('id-Chapinero', 200_000, 70_000), cifras('id-Armenia', 120_000, 45_000)];

    // El orden de la lista de tarifas no importa: el cruce es por id, no por
    // posicion. Si alguien lo cambiara por un `zip`, este test lo delata.
    expect(fusionarTarifas(filas, tarifas)).toEqual([
      { ...filas[0], tarifa_huesped: 120_000, pago_aseador: 45_000 },
      { ...filas[1], tarifa_huesped: 200_000, pago_aseador: 70_000 },
    ]);
  });

  test('una fila sin cifras conocidas sale con las dos en null, nunca undefined', () => {
    // Es el caso del apartamento en borrador, y es el que importa: `undefined`
    // pasaria el `ausente()` de `faltantesParaActivar` de otra forma y podria
    // pintar como activable un apartamento sin tarifas.
    const [salida] = fusionarTarifas([fila('Armenia')], []);

    expect(salida.tarifa_huesped).toBeNull();
    expect(salida.pago_aseador).toBeNull();
  });

  test('conserva un cero como cero y no lo convierte en null', () => {
    // `pago_aseador = 0` es una configuracion valida, no un campo sin llenar.
    // Un `||` en vez del `??` lo convertiria en null y el apartamento dejaria de
    // poder activarse.
    const [salida] = fusionarTarifas([fila('Armenia')], [cifras('id-Armenia', 0, 0)]);

    expect(salida.tarifa_huesped).toBe(0);
    expect(salida.pago_aseador).toBe(0);
  });

  test('ignora las tarifas de apartamentos que no estan en la lista', () => {
    const salida = fusionarTarifas([fila('Armenia')], [cifras('id-Fantasma', 999, 999)]);

    expect(salida).toHaveLength(1);
    expect(salida[0].tarifa_huesped).toBeNull();
  });

  test('sobre lista vacia devuelve []', () => {
    expect(fusionarTarifas([], [cifras('id-Armenia', 1, 1)])).toEqual([]);
  });
});
