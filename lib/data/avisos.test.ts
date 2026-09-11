import { describe, expect, it } from 'vitest';

import {
  leerEstadoDeAvisosPorAseador,
  RPC_ESTADO_AVISOS,
  SIN_AVISOS_REGISTRADOS,
} from './avisos';

/**
 * Lo que estos tests vigilan, y no es el agrupado: es LA FRONTERA.
 *
 * `leerEstadoDeAvisosPorAseador()` es el unico sitio del repo por donde el
 * estado de los avisos entra al navegador del admin. Dos cosas tienen que ser
 * ciertas aqui y en ningun otro lado:
 *
 *   1. Se va UNA vez a la base, no una por aseador.
 *   2. Del resultado no sale ninguna credencial de envio, ni aunque la funcion
 *      de la base creciera una columna manana.
 *
 * La autorizacion NO se prueba aqui: la comprueba `private.is_admin()` DENTRO de
 * la funcion y la afirma pgTAP con roles reales. Un test con un doble de cliente
 * pasaria igual con la guarda borrada.
 */

/** Las tres columnas que la funcion de la base NO tiene ranura para devolver. */
const CREDENCIALES = ['endpoint', 'p256dh', 'auth'];

function fila(parcial: Record<string, unknown> = {}) {
  return {
    aseador_id: 'a1',
    suscripciones_vivas: 2,
    verificado_por_toque: true,
    ultima_verificacion: '2026-09-08T15:00:00Z',
    ultimo_visto: '2026-09-10T11:00:00Z',
    ultimo_exito: '2026-09-10T11:05:00Z',
    primera_suscripcion_at: '2026-09-01T09:00:00Z',
    ...parcial,
  };
}

/**
 * Doble de cliente que registra CONTRA QUE se llamo y cuantas veces.
 *
 * El registro es el instrumento del test de "una sola llamada": sin el, ocho
 * viajes y uno solo devuelven exactamente el mismo mapa y el test seria un falso
 * verde. Comprobado con senuelo: metiendo la llamada dentro de un bucle sobre
 * los ocho aseadores, este archivo se pone rojo en el test del conteo y en
 * ningun otro.
 */
function clienteFalso(
  resultado: { data: unknown; error: { message: string } | null },
  registro: string[] = [],
): Parameters<typeof leerEstadoDeAvisosPorAseador>[0] {
  return {
    rpc: (nombre: string) => {
      registro.push(nombre);
      return Promise.resolve(resultado);
    },
  } as unknown as Parameters<typeof leerEstadoDeAvisosPorAseador>[0];
}

describe('leerEstadoDeAvisosPorAseador', () => {
  it('indexa por aseador y conserva los seis campos del agregado', async () => {
    const indice = await leerEstadoDeAvisosPorAseador(
      clienteFalso({
        data: [fila(), fila({ aseador_id: 'a2', suscripciones_vivas: 0 })],
        error: null,
      }),
    );

    expect(indice.get('a1')).toEqual({
      suscripciones_vivas: 2,
      verificado_por_toque: true,
      ultima_verificacion: '2026-09-08T15:00:00Z',
      ultimo_visto: '2026-09-10T11:00:00Z',
      ultimo_exito: '2026-09-10T11:05:00Z',
      primera_suscripcion_at: '2026-09-01T09:00:00Z',
    });
    expect(indice.get('a2')?.suscripciones_vivas).toBe(0);
  });

  it('va UNA sola vez a la base con ocho aseadores sembrados, no ocho', async () => {
    const registro: string[] = [];
    const ocho = Array.from({ length: 8 }, (_, i) => fila({ aseador_id: `a${i + 1}` }));

    const indice = await leerEstadoDeAvisosPorAseador(
      clienteFalso({ data: ocho, error: null }, registro),
    );

    expect(indice.size).toBe(8);
    expect(registro).toEqual([RPC_ESTADO_AVISOS]);
  });

  it('NO deja pasar ninguna credencial de envío, ni aunque la base la trajera', async () => {
    // La funcion de la base no tiene ranura para estas tres columnas. El objeto
    // se compone campo a campo justamente para que, si algun dia alguien se las
    // anadiera, se quedaran fuera de este mapa en vez de propagarse solas hasta
    // el navegador del admin (T-05-07).
    const indice = await leerEstadoDeAvisosPorAseador(
      clienteFalso({
        data: [fila({ endpoint: 'https://fcm.example/x', p256dh: 'clave-1', auth: 'clave-2' })],
        error: null,
      }),
    );

    const claves = Object.keys(indice.get('a1') ?? {});

    // Se afirma sobre las CLAVES y no sobre el contenido: un test que buscara el
    // valor pasaria el dia que la credencial llegara con otro texto.
    for (const credencial of CREDENCIALES) {
      expect(claves).not.toContain(credencial);
    }
    expect(claves).toHaveLength(6);
  });

  it('devuelve un mapa vacío cuando la función no trae ninguna fila', async () => {
    const indice = await leerEstadoDeAvisosPorAseador(clienteFalso({ data: null, error: null }));

    expect(indice.size).toBe(0);
  });

  it('propaga el error en vez de devolver un mapa vacío', async () => {
    // Un mapa vacio pintaria a los ocho aseadores como `Sin avisos`: una alarma
    // falsa indistinguible de la verdadera, en la pantalla donde el admin decide
    // a quien llamar por telefono.
    await expect(
      leerEstadoDeAvisosPorAseador(
        clienteFalso({ data: null, error: { message: 'no_autorizado' } }),
      ),
    ).rejects.toThrow(/no_autorizado/);
  });

  it('la constante de ausencia es cero suscripciones, no un hueco', async () => {
    // `SIN_AVISOS_REGISTRADOS` es lo que `./aseadores` pone cuando un aseador no
    // sale en el resultado. Tiene que ser un estado COMPLETO y derivable, no un
    // objeto a medias: `estadoDeAvisosDeAseador()` lo lee sin ramas defensivas.
    expect(SIN_AVISOS_REGISTRADOS.suscripciones_vivas).toBe(0);
    expect(SIN_AVISOS_REGISTRADOS.verificado_por_toque).toBe(false);
    expect(Object.keys(SIN_AVISOS_REGISTRADOS)).toHaveLength(6);
  });
});
