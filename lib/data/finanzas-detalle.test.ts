import { describe, expect, it } from 'vitest';

import {
  costoDeLaFicha,
  identificadorValido,
  leerAhoraMismo,
  leerAseadoraDeLaFicha,
  leerAseosDeAseadora,
  leerGastosDeAseadora,
  leerPagosDeAseadora,
  leerRentabilidadDeAseos,
  listarApartamentosGestionados,
  normalizarFiltroDeTipo,
  RPC_ASEO_EN_CURSO,
  RPC_ASEOS_DE_ASEADORA,
  RPC_GASTOS_DE_ASEADORA,
  RPC_PAGOS_DE_ASEADORA,
  RPC_RENTABILIDAD,
  totalizarDetalle,
  type AseoDelDetalle,
} from './finanzas-detalle';

/**
 * QUE VIGILAN ESTOS TESTS, Y QUE NO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA AUTORIZACION NO SE PRUEBA AQUI, Y NO SE INTENTA.
 *
 * Las cinco funciones de la base comprueban el rol por dentro y eso lo afirma
 * pgTAP con roles reales. Un doble de cliente NO TIENE PRIVILEGIOS: siempre
 * acepta, asi que un test de denegacion escrito aqui pasaria igual con la guarda
 * borrada. Seria un verde falso sobre la garantia mas cara de la fase.
 *
 * Y TAMPOCO SE PRUEBA FIN-05 AQUI. Que ninguna unidad de gestion externa llegue a
 * la tabla lo decide el `is_managed` de la funcion de la base, no este modulo.
 * Escribir aqui un test con un doble que no devuelve externas seria afirmar lo
 * que el propio test acaba de montar. Vive en pgTAP y en la suite E2E.
 *
 * Lo que si se puede fijar sin base, y es donde esta el riesgo de esta capa:
 *
 *   1. **QUE SE MIRE EL ERROR**, en las cinco. Es el defecto del 2026-09-11
 *      vuelto test: el servidor devolvia fallo, nadie lo miraba, y la pantalla
 *      decia que todo estaba bien.
 *   2. **QUE EL DINERO QUE LLEGA COMO TEXTO SE RECHACE LANZANDO.** Es el fallo
 *      silencioso de la fase: dos cadenas con el operador de suma se concatenan,
 *      el formateador de moneda funciona igual sobre texto, y la fila de totales
 *      saldria con miles de millones sin que nada lo delate.
 *   3. **QUE EL PIE SEA LA SUMA DE LAS FILAS QUE SE PINTAN.** Es la conciliacion,
 *      y es la asercion mas cara de esta pantalla.
 *   4. **QUE LOS TRES FILTROS VIAJEN A LA BASE**, y que los dos opcionales se
 *      OMITAN cuando no hay. Sin el registro de llamadas, una funcion que ignore
 *      un filtro devuelve exactamente lo mismo que una correcta.
 *   5. **QUE LA FORMA DE SALIDA SEA LA DEL DOMINIO**, campo a campo, para que una
 *      columna nueva de la base no se propague sola hasta el navegador.
 *   6. **QUE CERO FILAS DE «AHORA MISMO» NO SE CONFUNDA CON UNA FILA DE COLUMNAS
 *      NULAS.** Son dos cosas distintas y la pantalla pinta cosas distintas.
 *   7. **QUE EL HISTORIAL DE PAGOS NO RECIBA NINGUN RANGO.** La ausencia del
 *      argumento es el mecanismo que impide «arreglar» el bloque filtrandolo.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Llamada = { nombre: string; args: unknown };

/**
 * Doble de cliente que registra CONTRA QUE se llamo y con que argumentos.
 *
 * El registro es el instrumento de los puntos 4, 5 y 7: sin el, una funcion que
 * ignorase un filtro y una correcta devuelven el mismo objeto, y el test seria un
 * falso verde. Comprobado con senuelo: fijando `p_filtro` a una constante, este
 * archivo se pone rojo en los tres tests de filtro y en ningun otro.
 */
function clienteFalso(
  resultado: { data: unknown; error: { message: string } | null },
  registro: Llamada[] = [],
) {
  return {
    rpc: (nombre: string, args: unknown) => {
      registro.push({ nombre, args });
      return Promise.resolve(resultado);
    },
  } as unknown as Parameters<typeof leerRentabilidadDeAseos>[0];
}

/**
 * Doble del constructor de consultas de PostgREST, para las dos lecturas que NO
 * van por funcion: el combinado de apartamento y el nombre de la persona.
 *
 * Registra la tabla, las columnas y cada filtro encadenado. Es lo unico que hace
 * verificable que el combinado pide SOLO unidades gestionadas: sin el registro,
 * una consulta sin ese filtro devuelve lo mismo que una correcta contra un doble.
 */
function clienteDeTabla(
  resultado: { data: unknown; error: { message: string } | null },
  registro: Record<string, unknown>[] = [],
) {
  const constructor = {
    select: (columnas: string) => {
      registro.push({ paso: 'select', columnas });
      return constructor;
    },
    eq: (columna: string, valor: unknown) => {
      registro.push({ paso: 'eq', columna, valor });
      return constructor;
    },
    order: (columna: string, opciones: unknown) => {
      registro.push({ paso: 'order', columna, opciones });
      return Promise.resolve(resultado);
    },
    maybeSingle: () => {
      registro.push({ paso: 'maybeSingle' });
      return Promise.resolve(resultado);
    },
  };

  return {
    from: (tabla: string) => {
      registro.push({ paso: 'from', tabla });
      return constructor;
    },
  } as unknown as Parameters<typeof listarApartamentosGestionados>[0];
}

const RANGO = { desde: '2026-09-01', hasta: '2026-09-30' };
const ASEADORA = '8f14e45f-ceea-467a-9c1f-1b2c3d4e5f60';

/** Una fila cruda del detalle, completa. Los parciales pisan lo que haga falta. */
function filaDetalle(parcial: Record<string, unknown> = {}) {
  return {
    cleaning_id: 'c1',
    property_id: 'p1',
    property_nombre: 'Bogotá 3',
    fecha_programada: '2026-09-10',
    fecha_ejecucion: '2026-09-11',
    aseador_id: 'a1',
    aseador_nombre: 'María González',
    cobrado: 152_909,
    pagado: 48_211,
    margen: 104_698,
    tiene_gasto: true,
    tiene_dano: false,
    ...parcial,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOS DOS COLADORES DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

describe('normalizarFiltroDeTipo', () => {
  it('deja pasar los tres valores del contrato', () => {
    expect(normalizarFiltroDeTipo('todos')).toBe('todos');
    expect(normalizarFiltroDeTipo('con-gastos')).toBe('con-gastos');
    expect(normalizarFiltroDeTipo('con-danos')).toBe('con-danos');
  });

  it('cae en `todos` con cualquier otra cosa, y NO lanza', () => {
    // La base SI levanta P0001 ante un valor desconocido, y tiene razón: allí solo
    // puede venir de un defecto del código. Acá viene de una dirección escrita a
    // mano, y el contrato de este árbol es que eso enseñe la pantalla.
    expect(normalizarFiltroDeTipo('con-gasto')).toBe('todos');
    expect(normalizarFiltroDeTipo('')).toBe('todos');
    expect(normalizarFiltroDeTipo(undefined)).toBe('todos');
  });
});

describe('identificadorValido', () => {
  it('acepta un identificador con la forma canónica, en cualquier caja', () => {
    expect(identificadorValido(ASEADORA)).toBe(ASEADORA);
    expect(identificadorValido(ASEADORA.toUpperCase())).toBe(ASEADORA.toUpperCase());
  });

  it('rechaza todo lo que no tenga esa forma (T-07-56)', () => {
    // Sin esta comprobación, cada uno de estos llega a Postgres como argumento de
    // tipo identificador, responde 22P02, y la pantalla se cae con un error de
    // tipo que no sabe explicar.
    for (const crudo of [
      undefined,
      '',
      'todos',
      '8f14e45f',
      `${ASEADORA}x`,
      '8f14e45f-ceea-467a-9c1f-1b2c3d4e5fzz',
    ]) {
      expect(identificadorValido(crudo)).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EL DETALLE
// ═══════════════════════════════════════════════════════════════════════════

describe('leerRentabilidadDeAseos', () => {
  it('manda el rango y el tipo, y OMITE los dos filtros que no se pidieron', async () => {
    const registro: Llamada[] = [];
    await leerRentabilidadDeAseos(clienteFalso({ data: [], error: null }, registro), {
      ...RANGO,
      tipo: 'todos',
    });

    expect(registro).toHaveLength(1);
    expect(registro[0].nombre).toBe(RPC_RENTABILIDAD);
    // Omitidos y no en nulo: la función de la base los declara con `default null`
    // y el nulo ya significa «todos» allí dentro.
    expect(registro[0].args).toEqual({
      p_desde: '2026-09-01',
      p_hasta: '2026-09-30',
      p_filtro: 'todos',
    });
  });

  it('manda los tres filtros cuando los tres están puestos', async () => {
    const registro: Llamada[] = [];
    await leerRentabilidadDeAseos(clienteFalso({ data: [], error: null }, registro), {
      ...RANGO,
      apartamentoId: 'p9',
      aseadorId: 'a9',
      tipo: 'con-danos',
    });

    expect(registro[0].args).toEqual({
      p_desde: '2026-09-01',
      p_hasta: '2026-09-30',
      p_filtro: 'con-danos',
      p_property: 'p9',
      p_aseador: 'a9',
    });
  });

  it('devuelve la forma del dominio, campo a campo, y ninguna columna más', async () => {
    const filas = await leerRentabilidadDeAseos(
      // La columna intrusa es el señuelo: una función de la base que creciera una
      // coordenada o una cifra de más NO puede propagarse sola hasta el navegador
      // solo porque la capa hiciera `{ ...fila }`.
      clienteFalso({
        data: [filaDetalle({ captured_lat: 4.65, notas_internas: 'lo que sea' })],
        error: null,
      }),
      { ...RANGO, tipo: 'todos' },
    );

    expect(filas).toEqual([
      {
        aseoId: 'c1',
        apartamentoId: 'p1',
        apartamento: 'Bogotá 3',
        programado: '2026-09-10',
        ejecutado: '2026-09-11',
        aseadorId: 'a1',
        aseador: 'María González',
        cobrado: 152_909,
        pagado: 48_211,
        margen: 104_698,
        tieneGasto: true,
        tieneDano: false,
      },
    ]);
  });

  it('conserva el aseador nulo en vez de inventarle un nombre', async () => {
    const filas = await leerRentabilidadDeAseos(
      clienteFalso({
        data: [filaDetalle({ aseador_id: null, aseador_nombre: null })],
        error: null,
      }),
      { ...RANGO, tipo: 'todos' },
    );

    expect(filas[0].aseadorId).toBeNull();
    expect(filas[0].aseador).toBeNull();
  });

  it('lanza cuando la base devuelve error, en vez de pintar una lista vacía', async () => {
    await expect(
      leerRentabilidadDeAseos(
        clienteFalso({ data: null, error: { message: 'no_autorizado' } }),
        { ...RANGO, tipo: 'todos' },
      ),
    ).rejects.toThrow('no_autorizado');
  });

  it.each(['cobrado', 'pagado', 'margen'])(
    'lanza nombrando el campo cuando `%s` llega como texto',
    async (campo) => {
      await expect(
        leerRentabilidadDeAseos(
          clienteFalso({ data: [filaDetalle({ [campo]: '152909' })], error: null }),
          { ...RANGO, tipo: 'todos' },
        ),
      ).rejects.toThrow(new RegExp(`"${campo}".*string`));
    },
  );

  it('una lista vacía es un periodo sin coincidencias, no un defecto', async () => {
    await expect(
      leerRentabilidadDeAseos(clienteFalso({ data: [], error: null }), {
        ...RANGO,
        tipo: 'con-gastos',
      }),
    ).resolves.toEqual([]);
  });
});

describe('totalizarDetalle', () => {
  /** Dos filas con cifras distintas: con cifras iguales, sumar y duplicar coinciden. */
  const FILAS: AseoDelDetalle[] = [
    {
      aseoId: 'c1',
      apartamentoId: 'p1',
      apartamento: 'Bogotá 3',
      programado: '2026-09-10',
      ejecutado: '2026-09-11',
      aseadorId: 'a1',
      aseador: 'María González',
      cobrado: 152_909,
      pagado: 48_211,
      margen: 104_698,
      tieneGasto: false,
      tieneDano: false,
    },
    {
      aseoId: 'c2',
      apartamentoId: 'p2',
      apartamento: 'Medellín 1',
      programado: '2026-09-12',
      ejecutado: '2026-09-12',
      aseadorId: 'a2',
      aseador: 'Ana Ruiz',
      cobrado: 137_731,
      pagado: 41_117,
      margen: 96_614,
      tieneGasto: true,
      tieneDano: true,
    },
  ];

  it('cuenta las filas y suma las tres columnas de dinero', () => {
    expect(totalizarDetalle(FILAS)).toEqual({
      aseos: 2,
      cobrado: 290_640,
      pagado: 89_328,
      margen: 201_312,
    });
  });

  it('el pie cuadra con la resta de sus dos columnas, que es la conciliación', () => {
    const { cobrado, pagado, margen } = totalizarDetalle(FILAS);
    expect(margen).toBe(cobrado - pagado);
  });

  it('con un margen negativo el total baja, sin recortar a cero', () => {
    // Recortar escondería el único caso en el que esta cifra dice algo: un
    // periodo en el que los aseos costaron más de lo que dejaron.
    const enPerdida: AseoDelDetalle = {
      ...FILAS[0],
      aseoId: 'c3',
      cobrado: 40_000,
      pagado: 60_000,
      margen: -20_000,
    };

    expect(totalizarDetalle([...FILAS, enPerdida]).margen).toBe(181_312);
  });

  it('una lista vacía totaliza en ceros y cero aseos', () => {
    // Cero cobrado es un hecho del periodo, no un campo sin llenar: el pie se
    // sigue pintando aunque no haya ninguna fila.
    expect(totalizarDetalle([])).toEqual({ aseos: 0, cobrado: 0, pagado: 0, margen: 0 });
  });
});

describe('listarApartamentosGestionados', () => {
  it('pide SOLO unidades gestionadas, ordenadas por nombre (FIN-05)', async () => {
    const registro: Record<string, unknown>[] = [];
    await listarApartamentosGestionados(
      clienteDeTabla({ data: [{ id: 'p1', nombre: 'Bogotá 3' }], error: null }, registro),
    );

    expect(registro).toContainEqual({ paso: 'from', tabla: 'properties' });
    // El señuelo de FIN-05: sin este filtro, el combinado ofrecería una unidad
    // informativa y prometería un filtro que siempre devuelve vacío.
    expect(registro).toContainEqual({
      paso: 'eq',
      columna: 'gestion_vivaguest',
      valor: true,
    });
    expect(registro).toContainEqual({
      paso: 'order',
      columna: 'nombre',
      opciones: { ascending: true },
    });
  });

  it('lanza cuando la base devuelve error', async () => {
    await expect(
      listarApartamentosGestionados(
        clienteDeTabla({ data: null, error: { message: '42501' } }),
      ),
    ).rejects.toThrow('42501');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LA FICHA
// ═══════════════════════════════════════════════════════════════════════════

describe('leerAseadoraDeLaFicha', () => {
  it('filtra por identificador Y por rol de aseador', async () => {
    const registro: Record<string, unknown>[] = [];
    await leerAseadoraDeLaFicha(
      clienteDeTabla(
        { data: { id: ASEADORA, full_name: 'María González' }, error: null },
        registro,
      ),
      ASEADORA,
    );

    expect(registro).toContainEqual({ paso: 'eq', columna: 'id', valor: ASEADORA });
    // Sin este filtro, el identificador de un admin pegado en la dirección
    // abriría una ficha vacía con el nombre del dueño arriba.
    expect(registro).toContainEqual({ paso: 'eq', columna: 'role', valor: 'aseador' });
  });

  it('devuelve nulo cuando no hay fila', async () => {
    await expect(
      leerAseadoraDeLaFicha(clienteDeTabla({ data: null, error: null }), ASEADORA),
    ).resolves.toBeNull();
  });
});

describe('leerAhoraMismo', () => {
  it('devuelve el aseo en curso cuando lo hay', async () => {
    const registro: Llamada[] = [];
    const ahora = await leerAhoraMismo(
      clienteFalso(
        {
          data: [
            {
              esta_activa: true,
              cleaning_id: 'c1',
              property_id: 'p1',
              property_nombre: 'Bogotá 3',
              iniciado_at: '2026-09-13T19:32:00Z',
            },
          ],
          error: null,
        },
        registro,
      ),
      ASEADORA,
    );

    expect(registro[0].nombre).toBe(RPC_ASEO_EN_CURSO);
    expect(registro[0].args).toEqual({ p_aseador: ASEADORA });
    expect(ahora).toEqual({
      estaActiva: true,
      enCurso: { apartamento: 'Bogotá 3', iniciadoAt: '2026-09-13T19:32:00Z' },
    });
  });

  it('una fila con las columnas del aseo nulas es «no tiene ninguno en curso»', async () => {
    const ahora = await leerAhoraMismo(
      clienteFalso({
        data: [
          {
            esta_activa: true,
            cleaning_id: null,
            property_id: null,
            property_nombre: null,
            iniciado_at: null,
          },
        ],
        error: null,
      }),
      ASEADORA,
    );

    expect(ahora).toEqual({ estaActiva: true, enCurso: null });
  });

  it('conserva la cuenta desactivada, que es el tercer estado de la pantalla', async () => {
    const ahora = await leerAhoraMismo(
      clienteFalso({
        data: [
          {
            esta_activa: false,
            cleaning_id: null,
            property_id: null,
            property_nombre: null,
            iniciado_at: null,
          },
        ],
        error: null,
      }),
      ASEADORA,
    );

    expect(ahora?.estaActiva).toBe(false);
  });

  it('CERO filas es nulo, y no una persona activa sin aseo', async () => {
    // Es la asimetría que decide un 404: cero filas significa que ese
    // identificador no es de ningún perfil. Inventarse ahí un `estaActiva: true`
    // pintaría «no tiene ningún aseo en curso» sobre alguien que no existe.
    await expect(
      leerAhoraMismo(clienteFalso({ data: [], error: null }), ASEADORA),
    ).resolves.toBeNull();
  });

  it('lanza cuando la base devuelve error', async () => {
    await expect(
      leerAhoraMismo(clienteFalso({ data: null, error: { message: 'no_autorizado' } }), ASEADORA),
    ).rejects.toThrow('no_autorizado');
  });
});

describe('leerAseosDeAseadora', () => {
  it('manda la persona y el rango, y devuelve las CUATRO columnas del contrato', async () => {
    const registro: Llamada[] = [];
    const aseos = await leerAseosDeAseadora(
      clienteFalso(
        {
          data: [
            {
              cleaning_id: 'c1',
              property_id: 'p1',
              property_nombre: 'Bogotá 3',
              fecha_programada: '2026-01-28',
              fecha_ejecucion: '2026-02-02',
              pago: 48_211,
              // El señuelo de D7-7: aunque la base creciera estas dos columnas, la
              // ficha del admin y el desglose del aseador tienen que seguir siendo
              // el mismo documento.
              cobrado: 152_909,
              margen: 104_698,
            },
          ],
          error: null,
        },
        registro,
      ),
      ASEADORA,
      RANGO,
    );

    expect(registro[0].nombre).toBe(RPC_ASEOS_DE_ASEADORA);
    expect(registro[0].args).toEqual({
      p_aseador: ASEADORA,
      p_desde: '2026-09-01',
      p_hasta: '2026-09-30',
    });
    expect(aseos).toEqual([
      {
        aseoId: 'c1',
        apartamento: 'Bogotá 3',
        programado: '2026-01-28',
        ejecutado: '2026-02-02',
        pago: 48_211,
      },
    ]);
  });

  it('lanza nombrando el campo cuando el pago llega como texto', async () => {
    await expect(
      leerAseosDeAseadora(
        clienteFalso({
          data: [
            {
              cleaning_id: 'c1',
              property_id: 'p1',
              property_nombre: 'Bogotá 3',
              fecha_programada: '2026-01-28',
              fecha_ejecucion: '2026-02-02',
              pago: '48211',
            },
          ],
          error: null,
        }),
        ASEADORA,
        RANGO,
      ),
    ).rejects.toThrow(/"pago".*string/);
  });

  it('lanza cuando la base devuelve error', async () => {
    await expect(
      leerAseosDeAseadora(
        clienteFalso({ data: null, error: { message: 'no_autorizado' } }),
        ASEADORA,
        RANGO,
      ),
    ).rejects.toThrow('no_autorizado');
  });
});

describe('leerGastosDeAseadora', () => {
  /** Una fila cruda de gasto, con recibo. */
  function filaGasto(parcial: Record<string, unknown> = {}) {
    return {
      expense_id: 'g1',
      cleaning_id: 'c1',
      property_id: 'p1',
      property_nombre: 'Bogotá 3',
      fecha_ejecucion: '2026-09-11',
      concepto: 'Detergente',
      monto: 33_517,
      moneda: 'COP',
      evidencia_bucket: 'evidencia',
      evidencia_path: 'gastos/g1.jpg',
      ...parcial,
    };
  }

  it('conserva bucket y ruta SIN FIRMAR, que es lo que el servidor necesita', async () => {
    const registro: Llamada[] = [];
    const gastos = await leerGastosDeAseadora(
      clienteFalso({ data: [filaGasto()], error: null }, registro),
      ASEADORA,
      RANGO,
    );

    expect(registro[0].nombre).toBe(RPC_GASTOS_DE_ASEADORA);
    expect(gastos).toEqual([
      {
        gastoId: 'g1',
        apartamento: 'Bogotá 3',
        fecha: '2026-09-11',
        concepto: 'Detergente',
        monto: 33_517,
        evidencia: { bucket: 'evidencia', ruta: 'gastos/g1.jpg' },
      },
    ]);
  });

  it('sin ruta, la evidencia es nula y el gasto SIGUE en la lista', async () => {
    // Un gasto cuya foto se purgó sigue siendo un gasto que hay que reembolsar:
    // perderlo de la lista sería dejar de pagarlo.
    const gastos = await leerGastosDeAseadora(
      clienteFalso({
        data: [filaGasto({ evidencia_bucket: null, evidencia_path: null })],
        error: null,
      }),
      ASEADORA,
      RANGO,
    );

    expect(gastos).toHaveLength(1);
    expect(gastos[0].evidencia).toBeNull();
  });

  it('lanza nombrando el campo cuando el monto llega como texto', async () => {
    await expect(
      leerGastosDeAseadora(
        clienteFalso({ data: [filaGasto({ monto: '33517' })], error: null }),
        ASEADORA,
        RANGO,
      ),
    ).rejects.toThrow(/"monto".*string/);
  });

  it('lanza cuando la base devuelve error', async () => {
    await expect(
      leerGastosDeAseadora(
        clienteFalso({ data: null, error: { message: 'no_autorizado' } }),
        ASEADORA,
        RANGO,
      ),
    ).rejects.toThrow('no_autorizado');
  });
});

describe('leerPagosDeAseadora', () => {
  function filaPago(parcial: Record<string, unknown> = {}) {
    return {
      payout_id: 'y1',
      periodo_desde: '2026-01-01',
      periodo_hasta: '2026-01-30',
      monto_aseos: 480_000,
      monto_gastos: 33_517,
      monto_total: 513_517,
      moneda: 'COP',
      pagado_at: '2026-02-03T15:00:00Z',
      ...parcial,
    };
  }

  it('NO manda ningún rango: la ausencia del argumento es el mecanismo', async () => {
    const registro: Llamada[] = [];
    await leerPagosDeAseadora(clienteFalso({ data: [filaPago()], error: null }, registro), ASEADORA);

    expect(registro[0].nombre).toBe(RPC_PAGOS_DE_ASEADORA);
    // Este `toEqual` es el señuelo: el día que alguien «arregle» el bloque
    // pasándole el rango de la pantalla, este test se pone rojo. Filtrar el
    // historial dejaría «sus pagos» con una sola fila con el filtro en día.
    expect(registro[0].args).toEqual({ p_aseador: ASEADORA });
  });

  it('devuelve las dos partidas además del total, con las dos fechas del periodo', async () => {
    const pagos = await leerPagosDeAseadora(
      clienteFalso({ data: [filaPago()], error: null }),
      ASEADORA,
    );

    expect(pagos).toEqual([
      {
        pagoId: 'y1',
        desde: '2026-01-01',
        hasta: '2026-01-30',
        montoAseos: 480_000,
        montoGastos: 33_517,
        total: 513_517,
        pagadoAt: '2026-02-03T15:00:00Z',
      },
    ]);
  });

  it('conserva el pendiente como nulo, que es el otro estado de la fila', async () => {
    const pagos = await leerPagosDeAseadora(
      clienteFalso({ data: [filaPago({ pagado_at: null })], error: null }),
      ASEADORA,
    );

    expect(pagos[0].pagadoAt).toBeNull();
  });

  it.each(['monto_aseos', 'monto_gastos', 'monto_total'])(
    'lanza nombrando el campo cuando `%s` llega como texto',
    async (campo) => {
      await expect(
        leerPagosDeAseadora(
          clienteFalso({ data: [filaPago({ [campo]: '480000' })], error: null }),
          ASEADORA,
        ),
      ).rejects.toThrow(new RegExp(`"${campo}".*string`));
    },
  );

  it('lanza cuando la base devuelve error', async () => {
    await expect(
      leerPagosDeAseadora(
        clienteFalso({ data: null, error: { message: 'no_autorizado' } }),
        ASEADORA,
      ),
    ).rejects.toThrow('no_autorizado');
  });
});

describe('costoDeLaFicha', () => {
  const ASEOS = [
    { aseoId: 'c1', apartamento: 'A', programado: '2026-09-01', ejecutado: '2026-09-01', pago: 48_211 },
    { aseoId: 'c2', apartamento: 'B', programado: '2026-09-02', ejecutado: '2026-09-02', pago: 41_117 },
  ];
  const GASTOS = [
    {
      gastoId: 'g1',
      apartamento: 'A',
      fecha: '2026-09-01',
      concepto: 'Detergente',
      monto: 33_517,
      evidencia: null,
    },
  ];

  it('es lo que se le paga MÁS lo que se le reembolsa', () => {
    expect(costoDeLaFicha(ASEOS, GASTOS)).toBe(122_845);
  });

  it('sin aseos y sin gastos cuesta cero, que es un hecho del periodo', () => {
    expect(costoDeLaFicha([], [])).toBe(0);
  });

  it('la cabecera es exactamente la suma de los dos bloques que tiene debajo', () => {
    // La ficha no se puede contradecir a sí misma dentro de la misma pantalla:
    // por eso la cifra grande se suma de las mismas listas que se pintan y no de
    // una tercera consulta agregada.
    const porBloques =
      ASEOS.reduce((acc, a) => acc + a.pago, 0) + GASTOS.reduce((acc, g) => acc + g.monto, 0);

    expect(costoDeLaFicha(ASEOS, GASTOS)).toBe(porBloques);
  });
});
