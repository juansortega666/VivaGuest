import { beforeAll, describe, expect, test } from 'vitest';

import { sumarDias } from '@/lib/domain/dates';
import { periodoDeCierre, ultimoDiaHabilDelMes } from '@/lib/domain/mes';
import { clienteAdminDePruebas, type ClienteVivaGuest } from '@/lib/test/clientes';

/**
 * LA PARIDAD DEL CALENDARIO DE CIERRE: POSTGRES CONTRA TYPESCRIPT, 36 MESES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO A PROPÓSITO, POR PARTIDA DOBLE: ni `lib/domain/mes.ts`
 * (plan 07-06) ni las funciones de calendario de Postgres (plan 07-04) existen
 * todavía.
 *
 * ── POR QUÉ LA REGLA VIVE DOS VECES, Y POR QUÉ ESO FUE UNA DECISIÓN ────────
 *
 *   · `public.ultimo_dia_habil_del_mes()` y `public.periodo_de_cierre()` las
 *     consume el CIERRE, que corre dentro de la base, agrega decenas de aseos y
 *     no tiene sus filas en memoria.
 *   · `ultimoDiaHabilDelMes()` y `periodoDeCierre()` las consume la PANTALLA,
 *     que tiene que rotular el periodo antes de pedir nada y no puede hacer un
 *     viaje a la base para escribir una cabecera.
 *
 * **Dos implementaciones de la misma verdad divergen.** No es una posibilidad
 * remota: la Fase 6 lo midió el primer día que corrió su test de paridad. Y el
 * síntoma aquí sería el peor posible: la pantalla rotulando un periodo con unas
 * fechas mientras la base liquida otras, sobre el mismo mes y la misma persona.
 *
 * Como un periodo cerrado NO SE RECALCULA NUNCA (D7-3), una divergencia de un
 * solo día no se corrige después: se queda en el histórico y le cambia el pago a
 * alguien para siempre. Por eso una divergencia en cualquiera de los casos de
 * abajo es un FALLO, nunca un aviso.
 *
 * ── POR QUÉ SOBRE 36 MESES GENERADOS Y NO SOBRE TRES CASOS ESCOGIDOS ──────
 *
 * Porque los casos que uno escoge a mano son los que uno ya entendió. Los meses
 * se generan de 2026-01 a 2028-12 e incluyen, sin que nadie los elija: los que
 * terminan en sábado, los que terminan en domingo, los dos febreros normales y
 * el bisiesto de 2028, y los tres cruces de año. Ampliar el rango es cambiar dos
 * números.
 *
 * ── POR QUÉ ES DE INTEGRACIÓN Y NO UNITARIO ───────────────────────────────
 *
 * Porque una de las dos implementaciones ES SQL. Un doble de la base mediría una
 * tercera copia escrita por mí, que es exactamente el problema que este archivo
 * existe para evitar.
 * ════════════════════════════════════════════════════════════════════════════
 */

let admin: ClienteVivaGuest;

/**
 * Los 36 meses de 2026-01 a 2028-12, GENERADOS.
 *
 * Una lista literal se queda corta sola el día que alguien amplíe el rango, y el
 * mes que falte va a ser justo el raro.
 */
const MESES: string[] = [];
for (const ano of [2026, 2027, 2028]) {
  for (let mes = 1; mes <= 12; mes += 1) {
    MESES.push(`${ano}-${String(mes).padStart(2, '0')}`);
  }
}

/**
 * PUENTE TEMPORAL HACIA LAS FUNCIONES QUE TODAVÍA NO EXISTEN.
 *
 * Las dos funciones de calendario las crea la migración del plan 07-04, y hasta
 * que esa migración esté aplicada y se regeneren los tipos con el CLI, el
 * genérico `Database` no las conoce y el compilador no puede tipar la llamada.
 *
 * El cast está ACOTADO a este helper a propósito: cuando los tipos se regeneren,
 * se borran estas dos líneas y las llamadas de abajo no cambian. Un cast por
 * cada llamada sería el que se queda ahí para siempre.
 */
async function rpcSinTipar<T>(nombre: string, argumentos: Record<string, unknown>): Promise<T> {
  const cliente = admin as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>;
  };
  const { data, error } = await cliente.rpc(nombre, argumentos);
  if (error) throw new Error(`${nombre}(${JSON.stringify(argumentos)}): ${error.message}`);
  return data;
}

/** El cierre SEGÚN POSTGRES. */
function cierreSegunSql(dia: string): Promise<string> {
  return rpcSinTipar<string>('ultimo_dia_habil_del_mes', { p_dia: dia });
}

/**
 * El periodo SEGÚN POSTGRES, normalizado a la forma del gemelo de TypeScript.
 *
 * La función de la base es un `returns table`, así que PostgREST devuelve un
 * arreglo de una fila. Se exige exactamente una: cero filas o dos serían un
 * defecto de la función, y colapsarlo con un `[0]` silencioso lo escondería.
 */
async function periodoSegunSql(dia: string): Promise<{ desde: string; hasta: string }> {
  const filas = await rpcSinTipar<{ periodo_desde: string; periodo_hasta: string }[]>(
    'periodo_de_cierre',
    { p_dia: dia },
  );

  const lista = Array.isArray(filas) ? filas : [filas];
  if (lista.length !== 1) {
    throw new Error(`periodo_de_cierre('${dia}') devolvió ${lista.length} filas, se esperaba 1`);
  }
  return { desde: lista[0].periodo_desde, hasta: lista[0].periodo_hasta };
}

beforeAll(() => {
  admin = clienteAdminDePruebas();
});

describe('el calendario de cierre dice lo mismo en Postgres y en TypeScript', () => {
  test('genera exactamente los 36 meses de 2026 a 2028, sin lista literal', () => {
    // La lección del repo: comprobar siempre CUÁNTOS casos se van a medir, no
    // solo que el bucle no lance. Un generador roto dejaría los dos tests de
    // abajo en verde sin haber comparado nada.
    expect(MESES).toHaveLength(36);
    expect(MESES[0]).toBe('2026-01');
    expect(MESES[35]).toBe('2028-12');
  });

  test('ultimo_dia_habil_del_mes coincide con ultimoDiaHabilDelMes en los 36 meses', async () => {
    const divergencias: string[] = [];
    let comparados = 0;

    for (const mes of MESES) {
      const dia = `${mes}-15`;
      const sql = await cierreSegunSql(dia);
      const ts = ultimoDiaHabilDelMes(dia);
      comparados += 1;

      if (sql !== ts) {
        // Con el mes en el mensaje: una divergencia tiene que decir CUÁL, o el
        // fallo obliga a reproducir a mano los 36 casos para encontrarla.
        divergencias.push(`${mes}: SQL dice ${sql} y TypeScript dice ${ts}`);
      }
    }

    // Se acumulan todas y se afirman juntas. Fallar en la primera escondería las
    // otras treinta y cinco, y el patrón de una divergencia (¿solo los meses que
    // terminan en domingo? ¿solo los cruces de año?) es la mitad del diagnóstico.
    expect(divergencias).toEqual([]);
    expect(comparados).toBe(36);
  });

  test('periodo_de_cierre coincide con periodoDeCierre en los 36 meses', async () => {
    const divergencias: string[] = [];
    let comparados = 0;

    for (const mes of MESES) {
      const dia = `${mes}-15`;
      const sql = await periodoSegunSql(dia);
      const ts = periodoDeCierre(dia);
      comparados += 1;

      if (sql.desde !== ts.desde || sql.hasta !== ts.hasta) {
        divergencias.push(
          `${mes}: SQL dice ${sql.desde}..${sql.hasta} y TypeScript dice ${ts.desde}..${ts.hasta}`,
        );
      }
    }

    expect(divergencias).toEqual([]);
    expect(comparados).toBe(36);
  });

  test('coinciden TAMBIÉN en el día siguiente al cierre, que es el que D7-5 existe para resolver', async () => {
    // LA ENTRADA DE MÁS RIESGO DE TODA LA FASE.
    //
    // El día siguiente al cierre pertenece al periodo del mes SIGUIENTE. Es
    // donde las dos implementaciones tienen más margen para separarse, porque es
    // el único punto donde la respuesta no se deduce del mes del argumento. Un
    // aseo terminado ese día es exactamente el caso del sembrador de las 23:30.
    const divergencias: string[] = [];
    let comparados = 0;

    for (const mes of MESES) {
      const cierre = ultimoDiaHabilDelMes(`${mes}-15`);
      const huerfano = sumarDias(cierre, 1);

      const sql = await periodoSegunSql(huerfano);
      const ts = periodoDeCierre(huerfano);
      comparados += 1;

      if (sql.desde !== ts.desde || sql.hasta !== ts.hasta) {
        divergencias.push(
          `${mes}, día siguiente al cierre (${huerfano}): SQL dice ${sql.desde}..${sql.hasta} y TypeScript dice ${ts.desde}..${ts.hasta}`,
        );
      }

      // Y la propiedad que hace verdadero a D7-5: ese día NUNCA queda huérfano.
      // Las dos implementaciones tienen que meterlo en algún periodo.
      if (sql.desde > huerfano || sql.hasta < huerfano) {
        divergencias.push(`${huerfano} quedó fuera del periodo que SQL le asignó`);
      }
    }

    expect(divergencias).toEqual([]);
    expect(comparados).toBe(36);
  });
});
