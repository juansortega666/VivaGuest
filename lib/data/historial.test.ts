import { describe, expect, it } from 'vitest';

import {
  BLOQUE_HISTORIAL,
  leerHistorial,
  mezclarHistorial,
  type AseoDeHistorial,
  type DanoDeHistorial,
  type EntradaDeHistorial,
} from './historial';

/**
 * LA MEZCLA DEL HISTORIAL, QUE ES DONDE ESTÁ EL RIESGO (DASH-06, REPORT-04).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LOS DOS ERRORES QUE ESTE ARCHIVO EXISTE PARA ATRAPAR
 *
 *   1. CONCATENAR SIN REORDENAR. Dos consultas ordenadas descendentemente NO
 *      producen una lista ordenada al pegarlas: `[...aseos, ...danos]` deja los
 *      seis aseos arriba y los dos daños abajo, y la pantalla dice que un daño
 *      de hoy es más viejo que un aseo de la semana pasada. Es el error natural
 *      porque cada consulta, mirada sola, ya viene ordenada.
 *
 *   2. FILTRAR LOS DAÑOS RESUELTOS. `damages_open_idx` es un índice PARCIAL
 *      `where resolved_at is null` (migración 04). Quien lea el schema para
 *      escribir la consulta va a querer copiar ese predicado, porque es lo que
 *      hace que la consulta use el índice. El historial es COMPLETO por
 *      definición: un daño resuelto sigue siendo parte de la historia del
 *      apartamento, y esconderlo convierte "esta unidad se rompe cada mes" en
 *      "esta unidad no se rompe nunca".
 *
 * Los dos se corren de verdad como señuelo antes de dar el plan por hecho, y su
 * fallo literal queda anotado en el SUMMARY.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `leerHistorial` se mide aquí solo en su CONTRATO de llamada (qué tablas, qué
 * columnas, qué embeds, qué orden, qué límites), con un cliente falso. Que ese
 * contrato sea aceptable para PostgREST lo prueba `historial.integration.test.ts`:
 * `PGRST201` es un error de servidor y ningún stub lo puede producir.
 */

const APTO = '11111111-1111-4111-8111-111111111111';
const MARIA = { id: '22222222-2222-4222-8222-222222222222', full_name: 'María Aseadora' };

let contador = 0;
const idNuevo = () => `id-${(contador += 1)}`;

function aseo(patch: Partial<AseoDeHistorial> = {}): AseoDeHistorial {
  return {
    id: idNuevo(),
    scheduled_date: '2026-09-01',
    state: 'completada',
    tipo: 'normal',
    is_managed: true,
    confirmado_at: '2026-08-31T12:00:00Z',
    created_at: '2026-08-30T12:00:00Z',
    aseador: MARIA,
    ...patch,
  };
}

function dano(patch: Partial<DanoDeHistorial> = {}): DanoDeHistorial {
  return {
    id: idNuevo(),
    descripcion: 'Rejilla del sifón rota',
    created_at: '2026-09-01T15:00:00Z',
    resolved_at: null,
    reportadoPor: MARIA,
    ...patch,
  };
}

/** Las fechas de las entradas, en el orden en que salieron. */
const fechas = (entradas: EntradaDeHistorial[]) => entradas.map((e) => e.fecha);

/** `clase:id` de cada entrada, para comparar secuencias exactas. */
const secuencia = (entradas: EntradaDeHistorial[]) =>
  entradas.map((e) => `${e.clase}:${e.id}`);

// ─────────────────────────────────────────────────────────────────────────────

describe('mezclarHistorial', () => {
  it('devuelve UNA sola lista cronológica descendente, no dos listas pegadas', () => {
    // Intercalados a propósito: un aseo viejo, un daño nuevo, un aseo nuevo, un
    // daño viejo. Concatenar sin reordenar da
    // `[aseo viejo, aseo nuevo, daño nuevo, daño viejo]`, que empieza por lo más
    // antiguo. La aserción compara la SECUENCIA EXACTA, no un conteo.
    const aseoViejo = aseo({ id: 'a-viejo', scheduled_date: '2026-08-10' });
    const aseoNuevo = aseo({ id: 'a-nuevo', scheduled_date: '2026-09-05' });
    const danoNuevo = dano({ id: 'd-nuevo', created_at: '2026-09-03T10:00:00Z' });
    const danoViejo = dano({ id: 'd-viejo', created_at: '2026-08-20T10:00:00Z' });

    const entradas = mezclarHistorial([aseoViejo, aseoNuevo], [danoNuevo, danoViejo]);

    expect(secuencia(entradas)).toEqual([
      'aseo:a-nuevo',
      'dano:d-nuevo',
      'dano:d-viejo',
      'aseo:a-viejo',
    ]);
    expect(fechas(entradas)).toEqual(['2026-09-05', '2026-09-03', '2026-08-20', '2026-08-10']);
  });

  it('un daño RESUELTO aparece igual que uno abierto, con su marca', () => {
    const abierto = dano({ id: 'd-abierto', created_at: '2026-09-02T10:00:00Z' });
    const resuelto = dano({
      id: 'd-resuelto',
      created_at: '2026-09-01T10:00:00Z',
      resolved_at: '2026-09-04T10:00:00Z',
    });

    const entradas = mezclarHistorial([], [abierto, resuelto]);

    // Control primero: los dos están, y en su sitio cronológico.
    expect(secuencia(entradas)).toEqual(['dano:d-abierto', 'dano:d-resuelto']);

    // Y el resuelto conserva su marca, que es lo que la línea 2 pinta como
    // ` · Resuelto`. Si `leerHistorial` copiara el predicado de
    // `damages_open_idx`, esta lista tendría un solo elemento.
    const marcado = entradas[1];
    expect(marcado.clase).toBe('dano');
    if (marcado.clase !== 'dano') throw new Error('inalcanzable');
    expect(marcado.dano.resolved_at).toBe('2026-09-04T10:00:00Z');
  });

  it('las entradas son un tipo DISCRIMINADO, no un objeto con campos opcionales', () => {
    const entradas = mezclarHistorial([aseo({ id: 'a' })], [dano({ id: 'd' })]);

    for (const entrada of entradas) {
      if (entrada.clase === 'aseo') {
        // La rama de aseo no lleva daño, ni siquiera como `undefined`. Un objeto
        // con las dos mitades opcionales obligaría a la UI a comprobar cuál de
        // las dos vino, que es exactamente donde se renderiza una fila vacía.
        expect(entrada).not.toHaveProperty('dano');
        expect(entrada.aseo.id).toBe('a');
      } else {
        expect(entrada).not.toHaveProperty('aseo');
        expect(entrada.dano.id).toBe('d');
      }
    }

    // Las dos clases están, una vez cada una. El ORDEN entre ellas no es lo que
    // mide este test: lo fija el bloque de arriba.
    expect([...entradas.map((e) => e.clase)].sort()).toEqual(['aseo', 'dano']);
  });

  it('desempata dentro del MISMO día por el instante, y de forma estable', () => {
    // Los tres caen el 2026-09-01. El aseo lleva `scheduled_date` de ese día; los
    // dos daños se reportaron ese mismo día a horas distintas. Sin desempate, el
    // orden entre ellos dependería del orden de llegada de dos consultas
    // independientes y la lista bailaría entre dos cargas de la misma ficha.
    const delDia = aseo({ id: 'a-dia', scheduled_date: '2026-09-01' });
    const temprano = dano({ id: 'd-temprano', created_at: '2026-09-01T08:00:00Z' });
    const tarde = dano({ id: 'd-tarde', created_at: '2026-09-01T20:00:00Z' });

    expect(secuencia(mezclarHistorial([delDia], [temprano, tarde]))).toEqual(
      secuencia(mezclarHistorial([delDia], [tarde, temprano])),
    );
    expect(secuencia(mezclarHistorial([delDia], [temprano, tarde]))).toContain('dano:d-tarde');
    // El más tarde del día va antes que el más temprano del mismo día.
    const orden = secuencia(mezclarHistorial([], [temprano, tarde]));
    expect(orden).toEqual(['dano:d-tarde', 'dano:d-temprano']);
  });

  it('el día de un daño es el de BOGOTÁ, no el del proceso', () => {
    // 2026-09-02T02:00:00Z son las 21:00 del 1 de septiembre en Bogotá. La suite
    // corre con TZ=UTC, así que un `created_at.slice(0, 10)` diría el 2 y el daño
    // se pintaría un día después de haberse reportado.
    const nocturno = dano({ id: 'd-noche', created_at: '2026-09-02T02:00:00Z' });

    expect(fechas(mezclarHistorial([], [nocturno]))).toEqual(['2026-09-01']);
  });

  it('no reordena ni muta las listas que recibe', () => {
    const aseos = [aseo({ id: 'a1', scheduled_date: '2026-08-01' }), aseo({ id: 'a2' })];
    const danos = [dano({ id: 'd1' })];
    const copiaAseos = [...aseos];
    const copiaDanos = [...danos];

    mezclarHistorial(aseos, danos);

    expect(aseos).toEqual(copiaAseos);
    expect(danos).toEqual(copiaDanos);
  });

  it('sin nada que mezclar devuelve una lista vacía', () => {
    expect(mezclarHistorial([], [])).toEqual([]);
  });

  it('un aseo de gestión externa entra igual, con su estado nulo', () => {
    const inerte = aseo({
      id: 'a-inerte',
      is_managed: false,
      state: null,
      confirmado_at: null,
      aseador: null,
      scheduled_date: '2026-09-07',
    });

    const entradas = mezclarHistorial([inerte], []);

    expect(secuencia(entradas)).toEqual(['aseo:a-inerte']);
    const entrada = entradas[0];
    if (entrada.clase !== 'aseo') throw new Error('inalcanzable');
    expect(entrada.aseo.state).toBeNull();
    expect(entrada.aseo.aseador).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cliente falso de DOS tablas, que registra lo que se le pidió a cada una.
 *
 * Igual que el de `operacion.test.ts` y por la misma razón: lo que un unitario
 * puede afirmar sin base es el CONTRATO de la llamada. Aquí hace falta que
 * distinga por tabla, porque `leerHistorial` emite dos consultas y la mitad del
 * valor de este archivo es demostrar que la de `damages` NO lleva filtro por
 * `resolved_at`.
 */
function clienteFalso(porTabla: Record<string, unknown[]> = {}) {
  const llamadas: Record<
    string,
    {
      select: string;
      eq: [string, unknown][];
      is: [string, unknown][];
      order: [string, unknown][];
      limit: number[];
    }
  > = {};

  const supabase = {
    from(tabla: string) {
      const registro = (llamadas[tabla] = {
        select: '',
        eq: [] as [string, unknown][],
        is: [] as [string, unknown][],
        order: [] as [string, unknown][],
        limit: [] as number[],
      });

      const builder = {
        select(sel: string) {
          registro.select = sel;
          return builder;
        },
        eq(columna: string, valor: unknown) {
          registro.eq.push([columna, valor]);
          return builder;
        },
        is(columna: string, valor: unknown) {
          registro.is.push([columna, valor]);
          return builder;
        },
        order(columna: string, opciones?: unknown) {
          registro.order.push([columna, opciones]);
          return builder;
        },
        limit(n: number) {
          registro.limit.push(n);
          return builder;
        },
        then(resolver: (r: { data: unknown[]; error: null }) => unknown) {
          return resolver({ data: porTabla[tabla] ?? [], error: null });
        },
      };

      return builder;
    },
  };

  return { supabase, llamadas };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const comoCliente = (c: unknown) => c as any;

describe('leerHistorial', () => {
  it('lee las DOS tablas del apartamento, cada una con su embed calificado por FK', async () => {
    const { supabase, llamadas } = clienteFalso();

    await leerHistorial(comoCliente(supabase), APTO);

    expect(Object.keys(llamadas).sort()).toEqual(['cleanings', 'damages']);

    // `cleanings` tiene DOS claves foráneas hacia `profiles` (`aseador_id` y
    // `confirmado_by`) y `damages` tiene otras dos (`reported_by` y
    // `resolved_by`). Sin calificar, PostgREST responde PGRST201 en tiempo de
    // EJECUCIÓN: `database.types.ts` tipa el embed pero no ve la ambigüedad.
    expect(llamadas.cleanings.select).toContain('profiles!cleanings_aseador_id_fkey');
    expect(llamadas.damages.select).toContain('profiles!damages_reported_by_fkey');

    // Selects explícitos: ninguna columna de más viaja al navegador.
    expect(llamadas.cleanings.select).not.toContain('*');
    expect(llamadas.damages.select).not.toContain('*');

    expect(llamadas.cleanings.eq).toContainEqual(['property_id', APTO]);
    expect(llamadas.damages.eq).toContainEqual(['property_id', APTO]);
  });

  it('NO filtra los daños resueltos: el historial es completo por definición', async () => {
    const { supabase, llamadas } = clienteFalso();

    await leerHistorial(comoCliente(supabase), APTO);

    // Copiar el predicado de `damages_open_idx` (`where resolved_at is null`) es
    // el error obvio, porque es lo que haría que la consulta use ese índice.
    const columnasFiltradas = [
      ...llamadas.damages.is.map(([c]) => c),
      ...llamadas.damages.eq.map(([c]) => c),
    ];
    expect(columnasFiltradas).not.toContain('resolved_at');
    // Y la columna sí se PIDE: es lo que la línea 2 necesita para el sufijo.
    expect(llamadas.damages.select).toContain('resolved_at');
  });

  it('pide las dos listas en descendente, con desempate estable', async () => {
    const { supabase, llamadas } = clienteFalso();

    await leerHistorial(comoCliente(supabase), APTO);

    expect(llamadas.cleanings.order).toEqual([
      ['scheduled_date', { ascending: false }],
      ['created_at', { ascending: false }],
    ]);
    expect(llamadas.damages.order).toEqual([['created_at', { ascending: false }]]);
  });

  it('pide un bloque de 30 por defecto, con UNA de más para saber si hay siguiente', async () => {
    const { supabase, llamadas } = clienteFalso();

    const historial = await leerHistorial(comoCliente(supabase), APTO);

    expect(BLOQUE_HISTORIAL).toBe(30);
    // El techo es `desplazamiento + limite`, y se pide una fila extra a CADA
    // fuente: las 30 primeras de la mezcla solo pueden salir de las 30 primeras
    // de cada lista, y la 31 es la que responde `hayMas` sin un segundo viaje.
    expect(llamadas.cleanings.limit).toEqual([31]);
    expect(llamadas.damages.limit).toEqual([31]);
    expect(historial.entradas).toEqual([]);
    expect(historial.hayMas).toBe(false);
  });

  it('pagina por desplazamiento y dice si queda algo detrás', async () => {
    // Cuatro aseos, límite 2. Con desplazamiento 2 salen el tercero y el cuarto,
    // y ya no queda nada más.
    const cuatro = [
      aseo({ id: 'a1', scheduled_date: '2026-09-04' }),
      aseo({ id: 'a2', scheduled_date: '2026-09-03' }),
      aseo({ id: 'a3', scheduled_date: '2026-09-02' }),
      aseo({ id: 'a4', scheduled_date: '2026-09-01' }),
    ];

    const primera = await leerHistorial(
      comoCliente(clienteFalso({ cleanings: cuatro }).supabase),
      APTO,
      2,
      0,
    );
    expect(secuencia(primera.entradas)).toEqual(['aseo:a1', 'aseo:a2']);
    expect(primera.hayMas).toBe(true);

    const segunda = await leerHistorial(
      comoCliente(clienteFalso({ cleanings: cuatro }).supabase),
      APTO,
      2,
      2,
    );
    expect(secuencia(segunda.entradas)).toEqual(['aseo:a3', 'aseo:a4']);
    expect(segunda.hayMas).toBe(false);
    expect(segunda.desplazamiento).toBe(2);
  });

  it('mezcla lo que traen las dos consultas, no las concatena', async () => {
    const { supabase } = clienteFalso({
      cleanings: [
        aseo({ id: 'a-viejo', scheduled_date: '2026-08-10' }),
        aseo({ id: 'a-nuevo', scheduled_date: '2026-09-05' }),
      ],
      damages: [dano({ id: 'd-medio', created_at: '2026-09-01T10:00:00Z' })],
    });

    const historial = await leerHistorial(comoCliente(supabase), APTO);

    expect(secuencia(historial.entradas)).toEqual([
      'aseo:a-nuevo',
      'dano:d-medio',
      'aseo:a-viejo',
    ]);
  });
});
