import { describe, expect, it } from 'vitest';

import {
  leerMiDesglose,
  leerMisPagosCerrados,
  RPC_MIS_PAGOS,
  RPC_MI_DESGLOSE,
} from './pagos-aseador';

/**
 * QUE VIGILAN ESTOS TESTS, Y QUE NO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA AUTORIZACION NO SE PRUEBA AQUI, Y NO SE INTENTA.
 *
 * Las tres guardas viven dentro de las dos funciones de la base y las afirma
 * pgTAP con roles reales (aserciones 38 a 43 y 92 a 94 de
 * `11_financiero.test.sql`). Un doble de cliente NO TIENE PRIVILEGIOS: siempre
 * acepta, asi que un test de denegacion escrito aqui pasaria igual con la guarda
 * borrada. Seria un verde falso sobre la garantia mas cara de la fase.
 *
 * Lo que si se puede fijar sin base, y es donde esta el riesgo de esta capa:
 *
 *   1. **QUE EL TIPO NO ARRASTRE NINGUNA COLUMNA QUE LA BASE PUEDA CRECER.** Es
 *      la frontera convertida en test: una columna intrusa en la respuesta no
 *      puede propagarse sola hasta el telefono solo porque la capa hiciera
 *      `{ ...fila }`. No se filtra en el render: no llega.
 *   2. **QUE SE MIRE EL ERROR**, en vez de devolver una lista vacia que le
 *      diria al aseador que no tiene ningun pago cuando lo que hubo fue un
 *      fallo.
 *   3. **QUE LOS CASOS DE DENEGACION SE VEAN TODOS IGUAL**, y que un
 *      identificador mal formado ni siquiera llegue a la base.
 *   4. **QUE LA CABECERA SALGA DE LA LISTA**, que es lo que cierra la puerta del
 *      desglose ajeno antes de preguntar por sus lineas.
 *   5. **QUE LAS DOS CLASES DE LINEA SE SEPAREN**, con las DOS fechas por aseo
 *      (D7-8) y sin que la ruta de la foto se confunda con un dato de pantalla.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Una fila de la lista, con los nombres que devuelve la base. */
function filaDePago(parcial: Record<string, unknown> = {}) {
  return {
    payout_id: '11111111-1111-4111-8111-111111111111',
    periodo_desde: '2026-01-01',
    periodo_hasta: '2026-01-30',
    monto_aseos: 507_000,
    monto_gastos: 33_000,
    monto_total: 540_000,
    moneda: 'COP',
    pagado_at: null,
    ...parcial,
  };
}

/** Una linea de aseo del desglose. */
function lineaDeAseo(parcial: Record<string, unknown> = {}) {
  return {
    tipo: 'aseo',
    property_nombre: 'Tequendama 1204',
    concepto: null,
    fecha_programada: '2026-01-28',
    fecha_ejecucion: '2026-02-02',
    monto: 41_117,
    moneda: 'COP',
    evidencia_bucket: null,
    evidencia_path: null,
    ...parcial,
  };
}

/** Una linea de gasto del desglose, con su foto. */
function lineaDeGasto(parcial: Record<string, unknown> = {}) {
  return {
    tipo: 'gasto',
    property_nombre: 'Tequendama 1204',
    concepto: 'Jabón y guantes',
    fecha_programada: '2026-01-20',
    fecha_ejecucion: '2026-01-20',
    monto: 33_517,
    moneda: 'COP',
    evidencia_bucket: 'evidencia',
    evidencia_path: 'gastos/abc.jpg',
    ...parcial,
  };
}

const ID = '11111111-1111-4111-8111-111111111111';
const ID_AJENO = '22222222-2222-4222-8222-222222222222';

type Llamada = { nombre: string; args: unknown };
type Respuesta = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Doble de cliente que registra CONTRA QUE se llamo y devuelve una respuesta
 * distinta por nombre de funcion.
 *
 * El registro es el instrumento de los puntos 3 y 4: sin el, una capa que
 * consultara la base con un identificador mal formado y una que no lo hiciera
 * devuelven exactamente lo mismo, y el test seria un falso verde.
 */
function clienteFalso(respuestas: Record<string, Respuesta>, registro: Llamada[] = []) {
  return {
    rpc: (nombre: string, args: unknown) => {
      registro.push({ nombre, args });
      return Promise.resolve(respuestas[nombre] ?? { data: null, error: null });
    },
  } as unknown as Parameters<typeof leerMisPagosCerrados>[0];
}

describe('leerMisPagosCerrados', () => {
  it('llama UNA vez a la función de la lista, y sin ningún argumento', async () => {
    const registro: Llamada[] = [];
    await leerMisPagosCerrados(
      clienteFalso({ [RPC_MIS_PAGOS]: { data: [filaDePago()], error: null } }, registro),
    );

    expect(registro).toHaveLength(1);
    expect(registro[0].nombre).toBe(RPC_MIS_PAGOS);
    // Sin argumento, y es una decisión de producto: la función no recibe rango,
    // así que nadie puede pedirle el periodo en curso pasándole otras fechas.
    expect(registro[0].args).toBeUndefined();
  });

  it('devuelve los cinco campos, campo a campo, y ninguno más', async () => {
    const pagos = await leerMisPagosCerrados(
      // La columna intrusa es el señuelo del punto 1: una función de base que
      // creciera una cifra de huésped NO puede llegar al teléfono solo porque
      // esta capa propagara el objeto crudo.
      clienteFalso({
        [RPC_MIS_PAGOS]: {
          data: [filaDePago({ tarifa_huesped: 137_731, diferencia: 96_614 })],
          error: null,
        },
      }),
    );

    expect(pagos).toEqual([
      {
        payoutId: ID,
        desde: '2026-01-01',
        hasta: '2026-01-30',
        total: 540_000,
        pagadoAt: null,
      },
    ]);
    expect(Object.keys(pagos[0])).not.toContain('tarifa_huesped');
    expect(Object.keys(pagos[0])).not.toContain('diferencia');
  });

  it('conserva el instante del pago cuando ya se pagó', async () => {
    const pagos = await leerMisPagosCerrados(
      clienteFalso({
        [RPC_MIS_PAGOS]: {
          data: [filaDePago({ pagado_at: '2026-02-03T15:00:00Z' })],
          error: null,
        },
      }),
    );

    expect(pagos[0].pagadoAt).toBe('2026-02-03T15:00:00Z');
  });

  it('lanza cuando la base devuelve error, en vez de decir que no tiene pagos', async () => {
    await expect(
      leerMisPagosCerrados(
        clienteFalso({ [RPC_MIS_PAGOS]: { data: null, error: { message: 'no_autorizado' } } }),
      ),
    ).rejects.toThrow('no_autorizado');
  });

  it('una lista vacía es una persona sin ningún cierre todavía, no un fallo', async () => {
    await expect(
      leerMisPagosCerrados(clienteFalso({ [RPC_MIS_PAGOS]: { data: [], error: null } })),
    ).resolves.toEqual([]);
  });
});

describe('leerMiDesglose', () => {
  it('un identificador mal formado devuelve ausencia SIN tocar la base', async () => {
    const registro: Llamada[] = [];
    const desglose = await leerMiDesglose(clienteFalso({}, registro), 'no-soy-un-id');

    expect(desglose).toBeNull();
    // Sin esta guarda la base responde con un error de sintaxis y la pantalla se
    // cae con un error de servidor en vez de con su estado de ausencia.
    expect(registro).toHaveLength(0);
  });

  it('un pago que no está en su lista devuelve ausencia y NO pregunta por sus líneas', async () => {
    const registro: Llamada[] = [];
    const desglose = await leerMiDesglose(
      clienteFalso({ [RPC_MIS_PAGOS]: { data: [filaDePago()], error: null } }, registro),
      ID_AJENO,
    );

    expect(desglose).toBeNull();
    expect(registro.map((l) => l.nombre)).toEqual([RPC_MIS_PAGOS]);
  });

  it('la denegación de la base también se ve como ausencia, no como caída', async () => {
    const desglose = await leerMiDesglose(
      clienteFalso({
        [RPC_MIS_PAGOS]: { data: [filaDePago()], error: null },
        [RPC_MI_DESGLOSE]: {
          data: null,
          error: { message: 'no_autorizado', code: '42501' },
        },
      }),
      ID,
    );

    expect(desglose).toBeNull();
  });

  it('un fallo que NO es denegación sí lanza: no es "este pago no es tuyo"', async () => {
    await expect(
      leerMiDesglose(
        clienteFalso({
          [RPC_MIS_PAGOS]: { data: [filaDePago()], error: null },
          [RPC_MI_DESGLOSE]: {
            data: null,
            error: { message: 'connection reset', code: '08006' },
          },
        }),
        ID,
      ),
    ).rejects.toThrow('connection reset');
  });

  it('separa las dos clases de línea, con las DOS fechas por aseo', async () => {
    const desglose = await leerMiDesglose(
      clienteFalso({
        [RPC_MIS_PAGOS]: { data: [filaDePago()], error: null },
        [RPC_MI_DESGLOSE]: {
          data: [lineaDeAseo(), lineaDeGasto()],
          error: null,
        },
      }),
      ID,
    );

    expect(desglose?.aseos).toEqual([
      {
        apartamento: 'Tequendama 1204',
        // Las dos, SIEMPRE las dos (D7-8): sin ellas, un aseo de enero que
        // aparece en el recibo de febrero parece un error.
        programado: '2026-01-28',
        hecho: '2026-02-02',
        monto: 41_117,
      },
    ]);

    expect(desglose?.gastos).toEqual([
      {
        concepto: 'Jabón y guantes',
        fecha: '2026-01-20',
        monto: 33_517,
        recibo: { bucket: 'evidencia', ruta: 'gastos/abc.jpg' },
      },
    ]);
  });

  it('una línea sin foto llega sin ubicación de recibo, y media referencia tampoco cuenta', async () => {
    const desglose = await leerMiDesglose(
      clienteFalso({
        [RPC_MIS_PAGOS]: { data: [filaDePago()], error: null },
        [RPC_MI_DESGLOSE]: {
          data: [
            lineaDeGasto({ evidencia_bucket: null, evidencia_path: null }),
            lineaDeGasto({ concepto: 'Bolsas', evidencia_path: null }),
          ],
          error: null,
        },
      }),
      ID,
    );

    expect(desglose?.gastos.map((g) => g.recibo)).toEqual([null, null]);
  });

  it('la cabecera del desglose sale de la lista, con las dos fechas del periodo', async () => {
    const desglose = await leerMiDesglose(
      clienteFalso({
        [RPC_MIS_PAGOS]: {
          data: [filaDePago({ pagado_at: '2026-02-03T15:00:00Z' })],
          error: null,
        },
        [RPC_MI_DESGLOSE]: { data: [lineaDeAseo()], error: null },
      }),
      ID,
    );

    expect(desglose?.pago).toEqual({
      payoutId: ID,
      desde: '2026-01-01',
      hasta: '2026-01-30',
      total: 540_000,
      pagadoAt: '2026-02-03T15:00:00Z',
    });
  });

  it('un desglose sin ninguna línea sigue siendo un desglose, con sus dos listas vacías', async () => {
    const desglose = await leerMiDesglose(
      clienteFalso({
        [RPC_MIS_PAGOS]: { data: [filaDePago()], error: null },
        [RPC_MI_DESGLOSE]: { data: [], error: null },
      }),
      ID,
    );

    expect(desglose?.aseos).toEqual([]);
    expect(desglose?.gastos).toEqual([]);
  });
});
