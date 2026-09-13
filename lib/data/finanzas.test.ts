import { describe, expect, it } from 'vitest';

import {
  leerCostoPorAseadora,
  leerResumenFinanciero,
  RPC_COSTO_POR_ASEADORA,
  RPC_RESUMEN,
} from './finanzas';

/**
 * QUE VIGILAN ESTOS TESTS, Y QUE NO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA AUTORIZACION NO SE PRUEBA AQUI, Y NO SE INTENTA.
 *
 * Las dos funciones de la base comprueban el rol por dentro y eso lo afirma
 * pgTAP con roles reales (aserciones 17 a 22 de `11_financiero.test.sql`). Un
 * doble de cliente NO TIENE PRIVILEGIOS: siempre acepta, asi que un test de
 * denegacion escrito aqui pasaria igual con la guarda borrada. Seria un verde
 * falso sobre la garantia mas cara de la fase.
 *
 * Lo que si se puede fijar sin base, y es donde esta el riesgo de esta capa:
 *
 *   1. **QUE SE MIRE EL ERROR.** Es el defecto del 2026-09-11 vuelto test: el
 *      servidor devolvia fallo, nadie lo miraba, y la pantalla decia que todo
 *      estaba bien. Un `$ 0` de ganancia sobre un mes que si facturo es una
 *      cifra falsa sobre la que el dueno toma decisiones.
 *   2. **QUE CERO FILAS DEL RESUMEN SEA UN DEFECTO Y NO UN MES VACIO.** La
 *      funcion agrega con `coalesce`: un periodo sin operacion devuelve una fila
 *      de ceros. Cero filas solo puede ser un cambio de forma.
 *   3. **QUE LA LISTA VACIA DEL BLOQUE 3 SI SEA UN PERIODO SIN TRABAJO.** Es la
 *      asimetria con el punto 2, y es a proposito.
 *   4. **QUE SE VAYA UNA SOLA VEZ A LA BASE POR BLOQUE**, con el rango que se
 *      pidio. Sin el registro de llamadas, una funcion que ignore el rango
 *      devuelve exactamente lo mismo que una correcta.
 *   5. **QUE LA FORMA DE SALIDA SEA LA DEL DOMINIO**, campo a campo, para que
 *      una columna nueva de la base no se propague sola hasta el navegador.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Una fila del resumen, completa. Los parciales pisan lo que haga falta. */
function filaResumen(parcial: Record<string, unknown> = {}) {
  return {
    cobrado: 480_000,
    pagado_aseadores: 190_000,
    gastos_reembolsados: 8_000,
    ganancia: 282_000,
    margen_total: 290_000,
    margen_promedio: 58_000,
    aseos_hechos: 5,
    aseos_con_gastos: 2,
    aseos_con_danos: 1,
    ...parcial,
  };
}

/** Una fila del bloque 3, con los nombres que devuelve la base. */
function filaAseadora(parcial: Record<string, unknown> = {}) {
  return {
    aseador_id: 'a1',
    aseador_nombre: 'María González',
    cantidad_aseos: 3,
    total_pago: 135_000,
    total_gastos: 8_000,
    costo_total: 143_000,
    ...parcial,
  };
}

type Llamada = { nombre: string; args: unknown };

/**
 * Doble de cliente que registra CONTRA QUE se llamo y con que argumentos.
 *
 * El registro es el instrumento de los puntos 4 y 5: sin el, una funcion que
 * ignorase el rango y una correcta devuelven el mismo objeto, y el test seria un
 * falso verde. Comprobado con senuelo: fijando `p_desde` a una constante, este
 * archivo se pone rojo en los dos tests del rango y en ningun otro.
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
  } as unknown as Parameters<typeof leerResumenFinanciero>[0];
}

const RANGO = { desde: '2026-09-01', hasta: '2026-09-30' };

describe('leerResumenFinanciero', () => {
  it('llama UNA vez a la función del resumen con el rango que se le pidió', async () => {
    const registro: Llamada[] = [];
    await leerResumenFinanciero(
      clienteFalso({ data: [filaResumen()], error: null }, registro),
      RANGO,
    );

    expect(registro).toHaveLength(1);
    expect(registro[0].nombre).toBe(RPC_RESUMEN);
    expect(registro[0].args).toEqual({ p_desde: '2026-09-01', p_hasta: '2026-09-30' });
  });

  it('devuelve los nueve campos, campo a campo, y ninguno más', async () => {
    const resumen = await leerResumenFinanciero(
      // La columna intrusa es el señuelo del punto 5: una función de la base que
      // creciera una cifra de huésped por persona NO puede propagarse sola hasta
      // el navegador solo porque la capa hiciera `{ ...fila }`.
      clienteFalso({
        data: [filaResumen({ revenue_por_aseadora: 999_999 })],
        error: null,
      }),
      RANGO,
    );

    expect(resumen).toEqual({
      cobrado: 480_000,
      pagado_aseadores: 190_000,
      gastos_reembolsados: 8_000,
      ganancia: 282_000,
      margen_total: 290_000,
      margen_promedio: 58_000,
      aseos_hechos: 5,
      aseos_con_gastos: 2,
      aseos_con_danos: 1,
    });
    expect(Object.keys(resumen)).not.toContain('revenue_por_aseadora');
  });

  it('conserva el margen promedio NULO en vez de convertirlo en cero', async () => {
    // Con cero aseos no hubo ningún aseo que dejara nada, que no es lo mismo que
    // decir que cada aseo dejó cero. La pantalla lo pinta con em dash, y un `?? 0`
    // en esta capa haría que afirmara lo segundo.
    const resumen = await leerResumenFinanciero(
      clienteFalso({
        data: [filaResumen({ aseos_hechos: 0, margen_promedio: null })],
        error: null,
      }),
      RANGO,
    );

    expect(resumen.margen_promedio).toBeNull();
  });

  it('lanza cuando la base devuelve error, en vez de devolver ceros', async () => {
    await expect(
      leerResumenFinanciero(
        clienteFalso({ data: null, error: { message: 'permission denied' } }),
        RANGO,
      ),
    ).rejects.toThrow('permission denied');
  });

  it('lanza cuando no viene ninguna fila: un periodo sin operación devuelve ceros, no vacío', async () => {
    await expect(
      leerResumenFinanciero(clienteFalso({ data: [], error: null }), RANGO),
    ).rejects.toThrow(RPC_RESUMEN);
  });
});

describe('leerCostoPorAseadora', () => {
  it('llama UNA vez a la función del bloque 3 con el rango que se le pidió', async () => {
    const registro: Llamada[] = [];
    await leerCostoPorAseadora(
      clienteFalso({ data: [filaAseadora()], error: null }, registro),
      RANGO,
    );

    expect(registro).toHaveLength(1);
    expect(registro[0].nombre).toBe(RPC_COSTO_POR_ASEADORA);
    expect(registro[0].args).toEqual({ p_desde: '2026-09-01', p_hasta: '2026-09-30' });
  });

  it('traduce a la forma del dominio y no arrastra ninguna columna de la base', async () => {
    const filas = await leerCostoPorAseadora(
      clienteFalso({ data: [filaAseadora()], error: null }),
      RANGO,
    );

    // `costo` y `proporcion` NO salen de aquí: los calcula `costoPorAseadora()`
    // del dominio, que es donde vive la regla del denominador.
    expect(filas).toEqual([
      {
        aseadoraId: 'a1',
        nombre: 'María González',
        aseos: 3,
        pago: 135_000,
        gastos: 8_000,
      },
    ]);
  });

  it('una lista vacía es un periodo sin trabajo, no un fallo', async () => {
    // La asimetría con el resumen es deliberada: allá no hay agregado que faltar,
    // acá sí puede no haber nadie con aseos en el rango.
    await expect(
      leerCostoPorAseadora(clienteFalso({ data: [], error: null }), RANGO),
    ).resolves.toEqual([]);
  });

  it('lanza cuando la base devuelve error', async () => {
    await expect(
      leerCostoPorAseadora(
        clienteFalso({ data: null, error: { message: 'permission denied' } }),
        RANGO,
      ),
    ).rejects.toThrow('permission denied');
  });
});
