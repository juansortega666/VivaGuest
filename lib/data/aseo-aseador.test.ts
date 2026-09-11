import { describe, expect, it, vi } from 'vitest';

import { leerAseoDelAseador } from './aseo-aseador';

/**
 * LA LECTURA DE LA PANTALLA DE ATERRIZAJE, PROBADA EN AISLAMIENTO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE MIDE ESTE ARCHIVO Y LO QUE NO.
 *
 *   SI  -> que la consulta pida EXACTAMENTE los campos que la pantalla pinta y
 *          ninguna columna de credenciales, y que los cuatro casos que la
 *          pantalla tiene que tratar igual devuelvan todos `null`.
 *   NO  -> que la RLS deje ver o no una fila. Eso es Postgres real y se mide en
 *          `lib/domain/codigo-acceso.integration.test.ts` y en el pgTAP de la
 *          Fase 1.
 *
 * ── POR QUE LOS CUATRO CASOS DEVUELVEN LO MISMO ────────────────────────────
 *
 * `notifications.url` vale `'/aseos/' || cleaning_id` desde la migracion 09, o
 * sea que este identificador llega de fuera, tocado desde un aviso que pudo
 * quedarse obsoleto entre el envio y el toque. Cuatro situaciones distintas
 * acaban aqui y la pantalla las trata igual a proposito:
 *
 *   1. el identificador no existe
 *   2. el aseo es de otra persona  -> la RLS devuelve cero filas
 *   3. el aseo se cancelo          -> la RLS SI lo deja ver (ver abajo)
 *   4. el identificador ni siquiera tiene forma de identificador
 *
 * Distinguirlos en pantalla seria un oraculo de enumeracion de aseos ajenos, que
 * es la misma razon por la que el RPC del codigo lanza `42501` para sus tres
 * casos y no un error por cada uno.
 *
 * ── EL CASO 3 ES EL QUE NO SE VE LEYENDO LA POLICY POR ENCIMA ──────────────
 *
 * `cleanings_cleaner_select` es `is_active_cleaner() and aseador_id = auth.uid()`
 * y NO filtra por estado: un aseo cancelado que sigue teniendo a esta persona
 * como aseadora ES visible. El helper `private.my_cleaning_ids()` si excluye
 * `cancelada`, pero ese helper gobierna fotos y checklists, no la tabla de
 * aseos. Asi que el descarte tiene que estar aqui, escrito, o el caso 3 se cuela
 * con una ficha de un trabajo que ya no es de nadie.
 */

// ── El doble del cliente ─────────────────────────────────────────────────────
// Una sola ruta de lectura: `from().select().eq().maybeSingle()`.

type RespuestaFalsa = { data: unknown; error: { message: string } | null };

const ASEO_ID = '22222222-2222-4222-8222-222222222222';

function clienteQueDevuelve(respuesta: RespuestaFalsa) {
  const maybeSingle = vi.fn<() => Promise<RespuestaFalsa>>(async () => respuesta);
  const eq = vi.fn<(columna: string, valor: string) => { maybeSingle: typeof maybeSingle }>(
    () => ({ maybeSingle }),
  );
  const select = vi.fn<(columnas: string) => { eq: typeof eq }>(() => ({ eq }));
  const from = vi.fn<(tabla: string) => { select: typeof select }>(() => ({ select }));

  return { from, select, eq, maybeSingle };
}

/** La forma que devuelve la consulta cuando todo esta en su sitio. */
function filaCompleta(sobrescribir: Record<string, unknown> = {}) {
  return {
    id: ASEO_ID,
    scheduled_date: '2026-09-12',
    hora_limite: '11:30:00',
    num_huespedes: 4,
    instrucciones: 'Dejar el aire encendido.',
    state: 'pendiente',
    is_managed: true,
    confirmado_at: '2026-09-11T15:00:00Z',
    property: {
      id: '33333333-3333-4333-8333-333333333333',
      nombre: 'Bogotá 3',
      cluster: 'Chapinero',
      hora_limite: '11:30:00',
    },
    ...sobrescribir,
  };
}

// Se tipa laxo porque el doble no implementa `SupabaseClient` entero: lo que se
// mide es que la funcion reciba el cliente por parametro y solo use esa ruta.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteFalso = any;

// ════════════════════════════════════════════════════════════════════════════
// 1. LA CONSULTA PIDE LO QUE LA PANTALLA PINTA, Y NADA MAS
// ════════════════════════════════════════════════════════════════════════════

describe('la consulta', () => {
  it('pide los ocho campos del aseo que la pantalla pinta', async () => {
    const c = clienteQueDevuelve({ data: filaCompleta(), error: null });
    await leerAseoDelAseador(c as ClienteFalso, ASEO_ID);

    const columnas = c.select.mock.calls[0][0];

    for (const campo of [
      'id',
      'scheduled_date',
      'hora_limite',
      'num_huespedes',
      'instrucciones',
      'state',
      'is_managed',
      'confirmado_at',
    ]) {
      expect(columnas).toContain(campo);
    }
  });

  it('trae el apartamento por embed, con su nombre y su cluster', async () => {
    const c = clienteQueDevuelve({ data: filaCompleta(), error: null });
    await leerAseoDelAseador(c as ClienteFalso, ASEO_ID);

    const columnas = c.select.mock.calls[0][0];

    expect(columnas).toContain('properties!cleanings_property_id_fkey');
    expect(columnas).toContain('nombre');
    expect(columnas).toContain('cluster');
  });

  it('no nombra NINGUNA columna de credenciales del apartamento', async () => {
    const c = clienteQueDevuelve({ data: filaCompleta(), error: null });
    await leerAseoDelAseador(c as ClienteFalso, ASEO_ID);

    const columnas: string = c.select.mock.calls[0][0];

    // Las cuatro columnas de la tabla que no tiene ningun grant para
    // `authenticated`. Pedirlas aqui no devolveria el dato: devolveria `42501` y
    // tumbaria la pantalla entera. La unica ruta al codigo es el RPC.
    for (const credencial of ['codigo_acceso', 'notas_acceso', 'tipo_cerradura', 'ical_url']) {
      expect(columnas).not.toContain(credencial);
    }
  });

  it('filtra por el identificador del aseo y nada mas', async () => {
    const c = clienteQueDevuelve({ data: filaCompleta(), error: null });
    await leerAseoDelAseador(c as ClienteFalso, ASEO_ID);

    expect(c.from).toHaveBeenCalledWith('cleanings');
    expect(c.eq).toHaveBeenCalledTimes(1);
    expect(c.eq).toHaveBeenCalledWith('id', ASEO_ID);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. LOS CUATRO CASOS INDISTINGUIBLES
// ════════════════════════════════════════════════════════════════════════════

describe('los casos que la pantalla trata igual', () => {
  it('devuelve null cuando no hay fila, sin lanzar', async () => {
    const c = clienteQueDevuelve({ data: null, error: null });

    await expect(leerAseoDelAseador(c as ClienteFalso, ASEO_ID)).resolves.toBeNull();
  });

  it('devuelve null cuando el aseo esta cancelado, aunque la RLS lo deje ver', async () => {
    const c = clienteQueDevuelve({
      data: filaCompleta({ state: 'cancelada', confirmado_at: null }),
      error: null,
    });

    await expect(leerAseoDelAseador(c as ClienteFalso, ASEO_ID)).resolves.toBeNull();
  });

  it('devuelve null cuando el embed del apartamento no vino', async () => {
    // Pasa de verdad: `properties_cleaner_select` acota a
    // `private.my_property_ids()`, que es una ventana de hoy-1 a hoy+7 sobre
    // aseos vivos. Un aseo visible fuera de esa ventana llega con el embed en
    // nulo, y una ficha sin nombre de apartamento no es una ficha.
    const c = clienteQueDevuelve({ data: filaCompleta({ property: null }), error: null });

    await expect(leerAseoDelAseador(c as ClienteFalso, ASEO_ID)).resolves.toBeNull();
  });

  it('devuelve null con un identificador mal formado y NO toca la base', async () => {
    // El identificador llega de la URL, o sea de fuera. Sin esta guarda,
    // PostgREST responde `22P02 invalid input syntax for type uuid` y la
    // pantalla se cae con un error de servidor en vez de con su estado vacio.
    const c = clienteQueDevuelve({ data: null, error: null });

    await expect(leerAseoDelAseador(c as ClienteFalso, 'no-soy-un-uuid')).resolves.toBeNull();
    expect(c.from).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. EL CAMINO FELIZ Y EL ERROR DE VERDAD
// ════════════════════════════════════════════════════════════════════════════

describe('el resto', () => {
  it('devuelve la fila con su apartamento cuando todo esta en su sitio', async () => {
    const c = clienteQueDevuelve({ data: filaCompleta(), error: null });

    const aseo = await leerAseoDelAseador(c as ClienteFalso, ASEO_ID);

    expect(aseo?.id).toBe(ASEO_ID);
    expect(aseo?.property?.nombre).toBe('Bogotá 3');
    expect(aseo?.property?.cluster).toBe('Chapinero');
  });

  it('lanza cuando la base devuelve un error de verdad', async () => {
    // Un fallo de conexion NO es "este aseo no existe". Devolver `null` aqui
    // pintaria el estado vacio y le diria al aseador que su trabajo se cancelo.
    const c = clienteQueDevuelve({ data: null, error: { message: 'conexion caida' } });

    await expect(leerAseoDelAseador(c as ClienteFalso, ASEO_ID)).rejects.toThrow('conexion caida');
  });
});
