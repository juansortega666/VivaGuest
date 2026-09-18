import { describe, expect, test } from 'vitest';

import {
  fusionarAsignaciones,
  fusionarTarifas,
  listarClusters,
  type ApartamentoDeLista,
  type PerfilAsignable,
  type TarifaDeApartamento,
} from './apartamentos';

/**
 * Aqui solo se prueban las funciones PURAS del modulo: `listarClusters`,
 * `fusionarTarifas` y `fusionarAsignaciones`. Las que hablan con PostgREST y su
 * comportamiento real (que
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
 *
 * Y VALE IGUAL PARA LAS CUATRO COLUMNAS QUE LA FASE 8 ANADIO A LA LISTA
 * (`direccion`, `maps_url`, `hora_limite`, `suplente_id`). Que lleguen de la
 * base es cosa del grant y del test de integracion; lo que se fija aqui es que
 * el suplente se resuelva del MISMO mapa de perfiles que el responsable, o sea
 * sin una consulta propia, y que una fila sin suplente no reviente.
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
    direccion: null,
    maps_url: null,
    hora_limite: '11:30:00',
    suplente_id: null,
    responsableNombre: null,
    responsableActivo: null,
    suplenteNombre: null,
    suplenteActivo: null,
    tieneCalendario: false,
  };
}

/** Un perfil de aseador, tal como lo devuelve la consulta de `profiles`. */
function perfil(id: string, nombre: string, activo = true): PerfilAsignable {
  return { id, full_name: nombre, is_active: activo };
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

describe('fusionarAsignaciones', () => {
  const MARIA = perfil('p-maria', 'María González');
  const ANA = perfil('p-ana', 'Ana Rodríguez');
  const CARMEN = perfil('p-carmen', 'Carmen Díaz', false);

  /** Una fila con las dos asignaciones puestas a mano. */
  function conAsignaciones(
    cluster: string,
    responsable: string | null,
    suplente: string | null,
  ): ApartamentoDeLista {
    return { ...fila(cluster), responsable_id: responsable, suplente_id: suplente };
  }

  test('resuelve responsable y suplente contra el MISMO mapa de perfiles', () => {
    // Es la afirmacion central: el suplente NO cuesta una consulta propia. Si
    // alguien lo moviera a un segundo viaje, esta llamada dejaria de resolverlo
    // con la unica lista de perfiles que recibe.
    const [salida] = fusionarAsignaciones(
      [conAsignaciones('Armenia', MARIA.id, ANA.id)],
      [MARIA, ANA],
    );

    expect(salida.responsableNombre).toBe('María González');
    expect(salida.suplenteNombre).toBe('Ana Rodríguez');
  });

  test('una fila sin suplente sale con las dos columnas del suplente en null', () => {
    // El suplente es OPCIONAL (08-UI-SPEC §7.2: vacio es em dash con `sin
    // definir`). Una fila sin el no puede reventar ni salir con `undefined`,
    // que en el panel pintaria distinto que `null`.
    const [salida] = fusionarAsignaciones([conAsignaciones('Armenia', MARIA.id, null)], [MARIA]);

    expect(salida.suplenteNombre).toBeNull();
    expect(salida.suplenteActivo).toBeNull();
  });

  test('un perfil desactivado llega marcado, no filtrado', () => {
    // La consulta trae activos E INACTIVOS a proposito: si el responsable de un
    // apartamento quedo desactivado, su nombre tiene que seguir apareciendo,
    // con la marca detras. Filtrarlo convertiria la fila en un em dash y el
    // admin perderia el dato sin que nada se lo diga.
    const [salida] = fusionarAsignaciones(
      [conAsignaciones('Armenia', CARMEN.id, null)],
      [MARIA, CARMEN],
    );

    expect(salida.responsableNombre).toBe('Carmen Díaz');
    expect(salida.responsableActivo).toBe(false);
  });

  test('un identificador que no esta en la lista de perfiles sale como ausencia', () => {
    // Es el caso de un perfil que la RLS no deja ver. Para la base es distinto
    // de "sin asignar"; en pantalla es lo mismo, y lo importante es que no se
    // cuele un `undefined`.
    const [salida] = fusionarAsignaciones([conAsignaciones('Armenia', 'p-fantasma', null)], [MARIA]);

    expect(salida.responsableNombre).toBeNull();
    expect(salida.responsableActivo).toBeNull();
  });

  test('conserva las cuatro columnas nuevas de la lista', () => {
    // Las cuatro de §7.2 viajan en la MISMA consulta de las 39 filas. Este caso
    // fija que el cruce no las pierda por el camino: son las que alimentan el
    // grupo `UBICACIÓN Y ACCESO` del panel.
    const base: ApartamentoDeLista = {
      ...conAsignaciones('Armenia', MARIA.id, ANA.id),
      direccion: 'Calle 100 #15-20, apto 302',
      maps_url: 'https://maps.google.com/?q=x',
      hora_limite: '11:30:00',
    };

    const [salida] = fusionarAsignaciones([base], [MARIA, ANA]);

    expect(salida.direccion).toBe('Calle 100 #15-20, apto 302');
    expect(salida.maps_url).toBe('https://maps.google.com/?q=x');
    expect(salida.hora_limite).toBe('11:30:00');
    expect(salida.suplente_id).toBe(ANA.id);
  });

  test('sobre lista vacia devuelve []', () => {
    expect(fusionarAsignaciones([], [MARIA])).toEqual([]);
  });
});
