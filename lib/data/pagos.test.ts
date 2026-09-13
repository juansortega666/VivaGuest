import { describe, expect, it } from 'vitest';

import {
  leerDetalleDePago,
  leerPagosDelPeriodo,
  leerPeriodoPendienteDeCierre,
  leerPeriodosDePago,
  RPC_DETALLE_DE_PAGO,
  RPC_PAGOS_DEL_PERIODO,
  RPC_PERIODO_PENDIENTE,
  RPC_PERIODOS_DE_PAGO,
} from './pagos';

/**
 * QUE VIGILAN ESTOS TESTS, Y QUE NO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA AUTORIZACION NO SE PRUEBA AQUI, Y NO SE INTENTA.
 *
 * Las cuatro funciones de la base comprueban el rol por dentro y eso lo afirma
 * pgTAP con roles reales. Un doble de cliente NO TIENE PRIVILEGIOS: siempre
 * acepta, asi que un test de denegacion escrito aqui pasaria igual con la guarda
 * borrada. Seria un verde falso sobre la garantia mas cara de la fase.
 *
 * Lo que si se puede fijar sin base, y es donde esta el riesgo de esta capa:
 *
 *   1. **QUE SE MIRE EL ERROR.** Es el defecto del 2026-09-11 vuelto test. Aqui
 *      pesa mas que en el Resumen: un respaldo silencioso en lista vacia le
 *      diria al admin que no le debe nada a nadie.
 *   2. **QUE LA FORMA DE SALIDA SEA LA DEL DOMINIO**, campo a campo. La columna
 *      senuelo de cada caso es una cifra de huesped: si la funcion de la base
 *      creciera una manana, NO puede propagarse sola hasta el navegador solo
 *      porque esta capa hiciera `{ ...fila }`. Es la frontera de §10.1 escrita
 *      como test.
 *   3. **QUE `pagado_at` NULO SOBREVIVA COMO NULO.** Es lo que decide si la fila
 *      ofrece el boton de marcar pagado. Un `undefined` o una cadena vacia por
 *      el camino lo convertirian en «ya pagado» y el boton desapareceria de una
 *      fila que nadie ha cobrado.
 *   4. **QUE UN PERIODO SIN CERRAR SEA `null` Y NO UNA LISTA DE UNO.** Quien
 *      llama decide entre pintar y no pintar el aviso, no entre recorrer.
 *   5. **QUE SE VAYA UNA SOLA VEZ A LA BASE, con el argumento que se pidio.**
 *      Sin el registro de llamadas, una funcion que ignore el identificador
 *      devuelve exactamente lo mismo que una correcta.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Llamada = { nombre: string; args: unknown };

/**
 * Doble de cliente que registra CONTRA QUE se llamo y con que argumentos.
 *
 * El registro es el instrumento del punto 5: sin el, una funcion que ignorase el
 * argumento y una correcta devuelven el mismo objeto.
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
  } as unknown as Parameters<typeof leerPeriodosDePago>[0];
}

/** Una cabecera de periodo, completa. Los parciales pisan lo que haga falta. */
function filaPeriodo(parcial: Record<string, unknown> = {}) {
  return {
    periodo_desde: '2026-01-01',
    periodo_hasta: '2026-01-30',
    personas: 8,
    monto_total: 3_240_000,
    faltan_por_pagar: 3,
    aseos_no_computados: 2,
    moneda: 'COP',
    ...parcial,
  };
}

/** Una fila de la tabla interna de un periodo. */
function filaPago(parcial: Record<string, unknown> = {}) {
  return {
    payout_id: 'p1',
    aseador_nombre: 'María González',
    cantidad_aseos: 12,
    monto_aseos: 480_000,
    monto_gastos: 60_000,
    monto_total: 540_000,
    moneda: 'COP',
    pagado_at: null,
    ...parcial,
  };
}

/** Una linea del desglose. Por defecto, una de aseo. */
function filaLinea(parcial: Record<string, unknown> = {}) {
  return {
    tipo: 'aseo',
    property_nombre: 'Bogotá 3',
    concepto: null,
    fecha_programada: '2026-01-28',
    fecha_ejecucion: '2026-02-02',
    monto: 45_000,
    moneda: 'COP',
    evidencia_bucket: null,
    evidencia_path: null,
    ...parcial,
  };
}

describe('leerPeriodosDePago', () => {
  it('llama UNA vez a la función de periodos, sin argumentos', async () => {
    const registro: Llamada[] = [];
    await leerPeriodosDePago(clienteFalso({ data: [filaPeriodo()], error: null }, registro));

    expect(registro).toHaveLength(1);
    expect(registro[0].nombre).toBe(RPC_PERIODOS_DE_PAGO);
    expect(registro[0].args).toBeUndefined();
  });

  it('devuelve la cabecera campo a campo, y ninguna columna de más', async () => {
    const periodos = await leerPeriodosDePago(
      clienteFalso({
        // El señuelo del punto 2: una cifra de huésped en la cabecera del
        // periodo no puede llegar al navegador por propagación del objeto.
        data: [filaPeriodo({ cobrado_al_huesped: 9_999_999 })],
        error: null,
      }),
    );

    expect(periodos).toEqual([
      {
        desde: '2026-01-01',
        hasta: '2026-01-30',
        personas: 8,
        montoTotal: 3_240_000,
        faltanPorPagar: 3,
        aseosNoComputados: 2,
      },
    ]);
  });

  it('una lista vacía es un hecho del negocio: todavía no ha cerrado ningún periodo', async () => {
    const periodos = await leerPeriodosDePago(clienteFalso({ data: [], error: null }));
    expect(periodos).toEqual([]);
  });

  it('lanza cuando la base devuelve error, en vez de fingir que no hay periodos', async () => {
    await expect(
      leerPeriodosDePago(clienteFalso({ data: null, error: { message: 'no_autorizado' } })),
    ).rejects.toThrow('no_autorizado');
  });
});

describe('leerPagosDelPeriodo', () => {
  it('llama UNA vez con el día de inicio que se le pidió', async () => {
    const registro: Llamada[] = [];
    await leerPagosDelPeriodo(
      clienteFalso({ data: [filaPago()], error: null }, registro),
      '2026-01-01',
    );

    expect(registro).toHaveLength(1);
    expect(registro[0].nombre).toBe(RPC_PAGOS_DEL_PERIODO);
    expect(registro[0].args).toEqual({ p_desde: '2026-01-01' });
  });

  it('devuelve las dos partidas por separado además del total, campo a campo', async () => {
    const pagos = await leerPagosDelPeriodo(
      clienteFalso({
        // Dos señuelos a la vez: la cifra de huésped del punto 2, y el
        // identificador vivo de la persona, que la función de la base NO
        // devuelve a propósito para que nadie enlace a un perfil que puede ya
        // no existir.
        data: [filaPago({ tarifa_huesped: 137_731, aseador_id: 'viva' })],
        error: null,
      }),
      '2026-01-01',
    );

    expect(pagos).toEqual([
      {
        pagoId: 'p1',
        aseadora: 'María González',
        aseos: 12,
        montoAseos: 480_000,
        montoGastos: 60_000,
        montoTotal: 540_000,
        pagadoAt: null,
      },
    ]);
  });

  it('un pago sin marcar conserva su `pagadoAt` en nulo, que es lo que ofrece el botón', async () => {
    const [pendiente] = await leerPagosDelPeriodo(
      clienteFalso({ data: [filaPago({ pagado_at: null })], error: null }),
      '2026-01-01',
    );

    expect(pendiente.pagadoAt).toBeNull();
  });

  it('un pago marcado conserva su instante', async () => {
    const [pagado] = await leerPagosDelPeriodo(
      clienteFalso({ data: [filaPago({ pagado_at: '2026-02-03T15:04:05Z' })], error: null }),
      '2026-01-01',
    );

    expect(pagado.pagadoAt).toBe('2026-02-03T15:04:05Z');
  });

  it('lanza cuando la base devuelve error, en vez de dejar el periodo sin personas', async () => {
    await expect(
      leerPagosDelPeriodo(
        clienteFalso({ data: null, error: { message: 'no_autorizado' } }),
        '2026-01-01',
      ),
    ).rejects.toThrow('no_autorizado');
  });
});

describe('leerDetalleDePago', () => {
  it('llama UNA vez con el identificador del pago que se le pidió', async () => {
    const registro: Llamada[] = [];
    await leerDetalleDePago(clienteFalso({ data: [filaLinea()], error: null }, registro), 'p1');

    expect(registro).toHaveLength(1);
    expect(registro[0].nombre).toBe(RPC_DETALLE_DE_PAGO);
    expect(registro[0].args).toEqual({ p_payout: 'p1' });
  });

  it('la línea de aseo trae SUS DOS FECHAS y ninguna cifra de huésped', async () => {
    const lineas = await leerDetalleDePago(
      clienteFalso({
        data: [filaLinea({ tarifa_huesped: 137_731, margen: 96_614 })],
        error: null,
      }),
      'p1',
    );

    expect(lineas).toEqual([
      {
        tipo: 'aseo',
        apartamento: 'Bogotá 3',
        concepto: null,
        fechaProgramada: '2026-01-28',
        fechaEjecucion: '2026-02-02',
        monto: 45_000,
        recibo: null,
      },
    ]);
  });

  it('las dos fechas siguen viniendo por separado cuando COINCIDEN, sin colapsarse en una', async () => {
    // D7-8 en la capa de datos: si esta función devolviera una sola fecha en el
    // caso alineado, la interfaz no podría pintar la línea completa aunque
    // quisiera, y la regla se perdería aquí en vez de en el componente.
    const [linea] = await leerDetalleDePago(
      clienteFalso({
        data: [filaLinea({ fecha_programada: '2026-01-29', fecha_ejecucion: '2026-01-29' })],
        error: null,
      }),
      'p1',
    );

    expect(linea.fechaProgramada).toBe('2026-01-29');
    expect(linea.fechaEjecucion).toBe('2026-01-29');
  });

  it('la línea de gasto trae su concepto y la UBICACIÓN de su recibo, nunca una URL', async () => {
    const [gasto] = await leerDetalleDePago(
      clienteFalso({
        data: [
          filaLinea({
            tipo: 'gasto',
            concepto: 'Jabón y trapos',
            monto: 35_000,
            evidencia_bucket: 'evidencia',
            evidencia_path: 'gastos/g1.jpg',
          }),
        ],
        error: null,
      }),
      'p1',
    );

    expect(gasto.tipo).toBe('gasto');
    expect(gasto.concepto).toBe('Jabón y trapos');
    expect(gasto.recibo).toEqual({ bucket: 'evidencia', ruta: 'gastos/g1.jpg' });
  });

  it('un gasto cuya foto ya se purgó no tiene recibo, y eso no es un fallo', async () => {
    const [gasto] = await leerDetalleDePago(
      clienteFalso({
        data: [
          filaLinea({
            tipo: 'gasto',
            concepto: 'Jabón y trapos',
            evidencia_bucket: null,
            evidencia_path: null,
          }),
        ],
        error: null,
      }),
      'p1',
    );

    expect(gasto.recibo).toBeNull();
  });

  it('lanza cuando la base devuelve error, en vez de pintar un desglose vacío', async () => {
    await expect(
      leerDetalleDePago(clienteFalso({ data: null, error: { message: 'no_autorizado' } }), 'p1'),
    ).rejects.toThrow('no_autorizado');
  });
});

describe('leerPeriodoPendienteDeCierre', () => {
  it('devuelve null cuando no hay ninguno, que es el caso normal', async () => {
    const pendiente = await leerPeriodoPendienteDeCierre(
      clienteFalso({ data: [], error: null }),
    );

    expect(pendiente).toBeNull();
  });

  it('devuelve las dos fechas del periodo que no se cerró', async () => {
    const registro: Llamada[] = [];
    const pendiente = await leerPeriodoPendienteDeCierre(
      clienteFalso(
        { data: [{ periodo_desde: '2026-01-01', periodo_hasta: '2026-01-30' }], error: null },
        registro,
      ),
    );

    expect(registro[0].nombre).toBe(RPC_PERIODO_PENDIENTE);
    expect(pendiente).toEqual({ desde: '2026-01-01', hasta: '2026-01-30' });
  });

  it('lanza cuando la base devuelve error, en vez de esconder el aviso de recuperación', async () => {
    await expect(
      leerPeriodoPendienteDeCierre(
        clienteFalso({ data: null, error: { message: 'no_autorizado' } }),
      ),
    ).rejects.toThrow('no_autorizado');
  });
});
