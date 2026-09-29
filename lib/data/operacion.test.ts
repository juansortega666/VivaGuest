import { afterEach, describe, expect, it, vi } from 'vitest';

import { sumarDias } from '@/lib/domain/dates';

import {
  HORIZONTE_DIAS,
  SIN_ASIGNAR,
  VENTANA_ATRAS_DIAS,
  bandejaSinConfirmar,
  cargaPorAseador,
  filasDelDia,
  leerGastosDelDia,
  leerOperacion,
  resumenDelDia,
  type AseadorDeChip,
  type FilaDeOperacion,
} from './operacion';

/**
 * LAS TRES PROYECCIONES DE LA PANTALLA DE OPERACIÓN, COMO FUNCIONES PURAS.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Las tres superficies del dashboard (el carril ancho de DASH-01, la bandeja de
 * DASH-02 y los chips de DASH-03) son proyecciones distintas del MISMO conjunto
 * de filas. Por eso viven aquí, sobre objetos armados a mano y sin base: lo que
 * decide si el dashboard es correcto no es la consulta, es el filtro que se
 * aplica encima. Un conteo inflado en un chip manda a una aseadora a un
 * apartamento equivocado, y ningún test de integración lo va a ver porque la
 * consulta habrá devuelto exactamente lo que le pidieron.
 *
 * Lo que este archivo NO puede probar, y por eso existe el de integración: que
 * el embed calificado por nombre de FK no devuelva `PGRST201`. Aquí el cliente
 * es falso y responde lo que se le diga.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Día de negocio de referencia. Todo el archivo cuelga de esta fecha. */
const HOY = '2026-09-10';

/** Aritmética de calendario para las fechas de las fixtures. Sin zonas. */
function dia(offset: number): string {
  const [ano, mes, d] = HOY.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + offset)).toISOString().slice(0, 10);
}

let contador = 0;

function fila(parcial: Partial<FilaDeOperacion> = {}): FilaDeOperacion {
  contador += 1;
  return {
    id: `aseo-${contador}`,
    scheduled_date: HOY,
    state: 'pendiente',
    tipo: 'normal',
    hora_limite: '11:30:00',
    is_managed: true,
    is_urgent: false,
    needs_review: false,
    review_reason: null,
    cancel_reason: null,
    confirmado_at: null,
    num_huespedes: null,
    started_at: null,
    finished_at: null,
    aseador_id: null,
    property_id: 'apto-1',
    created_at: '2026-09-01T12:00:00+00:00',
    property: {
      id: 'apto-1',
      nombre: 'Bogotá 1',
      gestion_vivaguest: true,
      contacto_externo: null,
      hora_limite: '11:30:00',
    },
    aseador: null,
    // La marca de la Fase 6. Por defecto falsa: lo que la fila decia antes.
    sin_evidencia_completa: false,
    ...parcial,
  };
}

/** Fila inerte de gestión externa (DASH-07): sin estado y sin aseador. */
function filaInerte(parcial: Partial<FilaDeOperacion> = {}): FilaDeOperacion {
  return fila({
    state: null,
    is_managed: false,
    property: {
      id: 'apto-ext',
      nombre: 'Externo 1',
      gestion_vivaguest: false,
      contacto_externo: 'Administración externa',
      hora_limite: '11:30:00',
    },
    property_id: 'apto-ext',
    ...parcial,
  });
}

function ids(filas: FilaDeOperacion[]): string[] {
  return filas.map((f) => f.id);
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

describe('filasDelDia', () => {
  /**
   * LA PROYECCION DEL EJE NUEVO (plan 10-05).
   *
   * Sustituye a `agruparPorDia` cuando el eje de la pantalla deja de ser
   * "relativo a hoy". Lo que se mide aca no es el `===`: es que el filtro es SUYO
   * (la consulta trae la ventana entera a proposito, porque de ella salen las
   * alertas) y que no le hace nada a la lista que recibe.
   */
  it('devuelve SOLO las filas cuyo dia es exactamente el pedido', () => {
    const deAyer = fila({ scheduled_date: dia(-1) });
    const deHoy = fila({ scheduled_date: HOY });
    const deManana = fila({ scheduled_date: dia(1) });

    expect(ids(filasDelDia([deAyer, deHoy, deManana], HOY))).toEqual([deHoy.id]);
    expect(ids(filasDelDia([deAyer, deHoy, deManana], dia(-1)))).toEqual([deAyer.id]);
  });

  it('un dia sin nada devuelve la lista vacia y no revienta', () => {
    expect(filasDelDia([fila({ scheduled_date: HOY })], dia(3))).toEqual([]);
  });

  it('CONSERVA EL ORDEN DE ENTRADA', () => {
    // El orden de entrada es el de la consulta: fecha y despues hora limite.
    // Reordenar aca cambiaria el orden de la lista de la pantalla sin que nada lo
    // dijera, porque la proyeccion no tiene contrato de orden propio.
    const primera = fila({ hora_limite: '09:00:00' });
    const segunda = fila({ hora_limite: '11:00:00' });
    const tercera = fila({ hora_limite: '15:00:00' });

    expect(ids(filasDelDia([primera, segunda, tercera], HOY))).toEqual([
      primera.id,
      segunda.id,
      tercera.id,
    ]);
  });

  it('NO MUTA el array que recibe', () => {
    // `filas` es la MISMA lista que alimenta el vistazo y las alertas computadas.
    const entrada = [fila({ scheduled_date: dia(1) }), fila({ scheduled_date: HOY })];
    const antes = ids(entrada);

    filasDelDia(entrada, HOY);

    expect(ids(entrada)).toEqual(antes);
  });

  it('los cancelados y los de gestion externa se conservan en su dia', () => {
    // Los cancelados los necesita el contador del toggle `Ver cancelados (N)`, y
    // la unidad de gestion externa sale en la lista de su dia y no aparte
    // (DASH-07). Quien decide que se pinta es el componente.
    const cancelado = fila({ state: 'cancelada' });
    const externa = filaInerte();
    const normal = fila();

    expect(ids(filasDelDia([cancelado, externa, normal], HOY))).toEqual([
      cancelado.id,
      externa.id,
      normal.id,
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('resumenDelDia', () => {
  /**
   * EL VISTAZO DE CUATRO METRICAS (plan 10-05).
   *
   * Las dos cifras con trampa son urgentes en un dia pasado (nulo, no cero) y los
   * gastos (que vienen de otra tabla y por otro criterio de dia que `/finanzas`).
   */
  const SIN_GASTOS = { conteo: 0, total: 0 };

  it('activos cuenta los gestionados y NO cancelados del dia', () => {
    const r = resumenDelDia(
      [
        fila(),
        fila({ state: 'en_curso', confirmado_at: '2026-09-10T10:00:00+00:00' }),
        fila({ state: 'cancelada' }),
        fila({ scheduled_date: dia(1) }),
      ],
      HOY,
      HOY,
      SIN_GASTOS,
    );

    expect(r.activos).toBe(2);
  });

  it('activos INCLUYE los terminados, al reves que los chips de carga', () => {
    // `cargaPorAseador` responde "cuanto le queda por hacer a esta persona hoy" y
    // deja fuera lo completado. Esta cifra responde "cuantos aseos TIENE este dia", y
    // descontar los terminados haria que el numero bajara solo a lo largo del dia sin
    // que nada hubiera cambiado en el calendario.
    const r = resumenDelDia(
      [fila({ state: 'completada' }), fila()],
      HOY,
      HOY,
      SIN_GASTOS,
    );

    expect(r.activos).toBe(2);
  });

  it('las unidades de GESTION EXTERNA no cuentan como activos', () => {
    // Misma razon por la que `cargaPorAseador` las excluye: no son trabajo que
    // VivaGuest hace, y sumarlas al numero con el que el admin dimensiona su dia lo
    // haria decidir sobre trabajo que no es suyo.
    const r = resumenDelDia([fila(), fila(), filaInerte()], HOY, HOY, SIN_GASTOS);

    expect(r.activos).toBe(2);
  });

  it('sin confirmar del dia sale del MISMO predicado que la bandeja', () => {
    /**
     * ── LAS CUATRO FILAS ESTAN ELEGIDAS PARA QUE CADA TERMINO DEL PREDICADO
     *    LO DEFIENDA UNA FILA PROPIA, Y ESO NO ES CELO ─────────────────────
     *
     * El predicado del indice parcial `cleanings_unconfirmed_idx` tiene TRES
     * terminos (`is_managed`, `state = 'pendiente'`, `confirmado_at is null`) y el
     * error facil es escribir un caso en el que un termino tape a otro: una fila con
     * `is_managed: false` Y `state: null` no distingue si el filtro mira la gestion o
     * el estado, porque falla los dos.
     *
     * **MEDIDO el 2026-09-28**: con la fila externa escrita asi, quitar el termino
     * `is_managed` del filtro NO PONIA NADA EN ROJO. De ahi la tercera fila de abajo.
     *
     * Y su forma es ILEGAL en la base: `cl_unmanaged_is_inert` prohibe una unidad de
     * gestion externa con estado. Se escribe igual, y es deliberado: esta es una
     * proyeccion PURA y su contrato no puede depender de que su entrada venga legal.
     * Es el mismo argumento que la cabecera de `filasDelDia` hace por el otro lado.
     */
    const r = resumenDelDia(
      [
        fila(), // gestionada, pendiente y sin confirmar: la unica que cuenta
        fila({ confirmado_at: '2026-09-09T10:00:00+00:00' }), // ya confirmada
        fila({ is_managed: false, state: 'pendiente', confirmado_at: null }), // externa
        fila({ state: 'en_curso', confirmado_at: '2026-09-09T10:00:00+00:00' }),
        fila({ state: 'cancelada', confirmado_at: null }), // cancelada sin confirmar
        // Y esta defiende el termino del ESTADO por si sola: gestionada, sin
        // confirmar y NO pendiente. Sin ella, cambiar `state = 'pendiente'` por
        // `state <> 'cancelada'` NO ponia nada en rojo. Medido el 2026-09-28. Su
        // forma tambien es ilegal (`cl_completada_shape` exige inicio y fin), y va
        // por la misma razon que la externa de arriba.
        fila({ state: 'completada', confirmado_at: null }),
      ],
      HOY,
      HOY,
      SIN_GASTOS,
    );

    expect(r.sinConfirmar).toBe(1);
  });

  it('sin confirmar en OTROS dias cuenta la ventana entera menos el dia', () => {
    // D-05-7: es lo que conserva la promesa del criterio 1 al matar la bandeja
    // lateral. Un sin confirmar de dentro de tres dias se ve HOY, sin navegar.
    const r = resumenDelDia(
      [fila(), fila({ scheduled_date: dia(3) }), fila({ scheduled_date: dia(-2) })],
      HOY,
      HOY,
      SIN_GASTOS,
    );

    expect(r.sinConfirmar).toBe(1);
    expect(r.sinConfirmarEnOtrosDias).toBe(2);
  });

  it('sin desbordamiento, la cifra de otros dias es cero', () => {
    const r = resumenDelDia([fila()], HOY, HOY, SIN_GASTOS);

    expect(r.sinConfirmarEnOtrosDias).toBe(0);
  });

  it('urgentes cuenta los vivos y urgentes de hoy', () => {
    const r = resumenDelDia(
      [
        fila({ is_urgent: true }),
        fila({ is_urgent: true, state: 'cancelada' }),
        fila({ is_urgent: false }),
      ],
      HOY,
      HOY,
      SIN_GASTOS,
    );

    expect(r.urgentes).toBe(1);
  });

  it('urgentes es NULO, y no cero, en un dia ANTERIOR a hoy', () => {
    // D-05-3. `is_urgent` solo se mantiene para `scheduled_date >= today_bog()`, asi
    // que en un dia pasado el valor esta CONGELADO. Nulo y cero son cosas distintas y
    // la pantalla los pinta distinto: cero dice "no hay ninguno", nulo dice "esta
    // pregunta no tiene respuesta para este dia".
    const r = resumenDelDia(
      [fila({ scheduled_date: dia(-1), is_urgent: true })],
      dia(-1),
      HOY,
      SIN_GASTOS,
    );

    expect(r.urgentes).toBeNull();
    expect(r.urgentes).not.toBe(0);
  });

  it('urgentes SI se cuenta en hoy y en el futuro', () => {
    expect(resumenDelDia([fila({ is_urgent: true })], HOY, HOY, SIN_GASTOS).urgentes).toBe(1);
    expect(
      resumenDelDia(
        [fila({ scheduled_date: dia(2), is_urgent: true })],
        dia(2),
        HOY,
        SIN_GASTOS,
      ).urgentes,
    ).toBe(1);
  });

  it('los gastos viajan tal cual, incluido el nulo de lectura fallida', () => {
    // El nulo NO se convierte en cero: cero dice que no hubo gastos y nulo dice que no
    // se pudieron leer.
    const r = resumenDelDia([fila()], HOY, HOY, { conteo: null, total: null });

    expect(r.gastos).toEqual({ conteo: null, total: null });
  });

  it('un dia sin nada devuelve ceros y no revienta', () => {
    const r = resumenDelDia([fila({ scheduled_date: dia(4) })], HOY, HOY, SIN_GASTOS);

    expect(r.activos).toBe(0);
    expect(r.sinConfirmar).toBe(0);
    expect(r.urgentes).toBe(0);
    expect(r.sinConfirmarEnOtrosDias).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leerGastosDelDia', () => {
  type Respuesta = { data: { monto: number }[] | null; error: { message: string } | null };

  function clienteDeGastos(respuesta: Respuesta) {
    const dentro = vi.fn(async () => respuesta);
    const select = vi.fn(() => ({ in: dentro }));
    const from = vi.fn(() => ({ select }));
    return { supabase: { from }, from, select, dentro };
  }

  it('suma los montos y cuenta las filas', async () => {
    const c = clienteDeGastos({ data: [{ monto: 30_000 }, { monto: 150_000 }], error: null });

    const r = await leerGastosDelDia(comoCliente(c.supabase), ['a', 'b']);

    expect(r).toEqual({ conteo: 2, total: 180_000 });
    // El unico indice de la tabla es `expenses_cleaning_idx on (cleaning_id)`, y
    // preguntar por la lista de aseos del dia es exactamente lo que cubre.
    expect(c.from).toHaveBeenCalledWith('expenses');
    expect(c.dentro).toHaveBeenCalledWith('cleaning_id', ['a', 'b']);
  });

  it('con lista vacia NO pregunta nada', async () => {
    const c = clienteDeGastos({ data: [], error: null });

    const r = await leerGastosDelDia(comoCliente(c.supabase), []);

    expect(r).toEqual({ conteo: 0, total: 0 });
    expect(c.from).not.toHaveBeenCalled();
  });

  it('si la consulta falla SE DEGRADA a nulos y no lanza', async () => {
    // Tumbar `/operacion` —la pantalla desde la que el admin confirma y reasigna—
    // porque una metrica accesoria no se pudo leer seria cambiar un dato que falta por
    // una jornada sin herramienta.
    const c = clienteDeGastos({ data: null, error: { message: 'caida' } });

    const r = await leerGastosDelDia(comoCliente(c.supabase), ['a']);

    expect(r).toEqual({ conteo: null, total: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('el eje del dia, donde estaba la agrupacion relativa a hoy', () => {
  /**
   * ════════════════════════════════════════════════════════════════════════════
   * AQUI VIVIAN LOS DOS `describe` DE `agruparPorDia`. LA FUNCION MURIO CON EL
   * REDISENO (plan 10-05) Y SUS CASOS **SE REESCRIBIERON, NO SE BORRARON**.
   *
   * `agruparPorDia` codificaba el eje `Atrasados / Hoy / Mañana / Siguientes` —o
   * sea "relativo a hoy"— DENTRO de la capa de datos. Con un selector de dia,
   * `Mañana` deja de tener significado y lo que queda en su sitio son
   * `filasDelDia()` y `resumenDelDia()`.
   *
   * Lo que NO se puede perder son las PROPIEDADES que sus casos afirmaban, y este
   * bloque las conserva una por una:
   *
   *   1. un aseo de AYER sale en la lista de AYER y en ninguna otra
   *   2. las filas de gestion externa salen en la lista de SU DIA, no aparte
   *   3. los cancelados SE CONSERVAN en las filas, porque el contador del toggle
   *      `Ver cancelados (N)` los necesita
   *   4. el orden de entrada se conserva
   *
   * Las tres primeras tienen caso propio abajo; la cuarta la afirma el bloque de
   * `filasDelDia` de mas arriba, con su propio caso por nombre.
   *
   * ── LO QUE SE FUE DE VERDAD, Y HAY QUE DECIRLO ─────────────────────────────
   *
   * Los casos que afirmaban la FORMA de los bloques —cinco grupos de `Siguientes`
   * vacios incluidos, el agrupado por dia de `Atrasados`, su orden ascendente, su
   * `masViejoAtrasado`— no tienen equivalente: afirmaban una estructura que ya no
   * existe. Lo que aquella estructura daba (que un atrasado se vea y su alerta
   * aterrice) lo da ahora el selector de dia mas el dia metido en el destino de la
   * alerta, y eso se mide en `alertas.test.ts` y en la suite E2E, no aqui.
   *
   * ── Y LAS DOS CONSTANTES SIGUEN VIVAS, QUE ERA EL RIESGO ──────────────────
   *
   * `HORIZONTE_DIAS` y `VENTANA_ATRAS_DIAS` se fueron a borrar con la funcion y no
   * se borraron: siguen definiendo la ventana que alimenta las alertas y la cifra
   * de desbordamiento del vistazo. Hay un caso abajo que lo afirma por valor.
   * ════════════════════════════════════════════════════════════════════════════
   */

  it('un aseo de AYER sale en la lista de AYER y en ninguna otra', () => {
    // Hasta D-08 un aseo de ayer no aparecia en ninguna parte y la alerta que
    // `alertasComputadas()` si sabia producir no tenia donde aterrizar (criterio 7
    // del ROADMAP). Con el eje del dia, "donde aterriza" es el dia del aseo.
    const deAyer = fila({ scheduled_date: dia(-1) });
    const deHoy = fila({ scheduled_date: HOY });
    const deManana = fila({ scheduled_date: dia(1) });

    const todas = [deAyer, deHoy, deManana];

    expect(ids(filasDelDia(todas, dia(-1)))).toEqual([deAyer.id]);
    expect(ids(filasDelDia(todas, HOY))).toEqual([deHoy.id]);
    expect(ids(filasDelDia(todas, dia(1)))).toEqual([deManana.id]);
  });

  it('las filas de gestion externa salen en la lista de SU DIA, no aparte', () => {
    const inerte = filaInerte({ scheduled_date: HOY });
    const gestionado = fila({ scheduled_date: HOY });

    expect(ids(filasDelDia([gestionado, inerte], HOY))).toEqual([gestionado.id, inerte.id]);
  });

  it('los cancelados SE conservan: el toggle `Ver cancelados (N)` necesita su conteo', () => {
    const cancelado = fila({ scheduled_date: HOY, state: 'cancelada' });
    const vivo = fila({ scheduled_date: HOY });

    expect(ids(filasDelDia([cancelado, vivo], HOY))).toEqual([cancelado.id, vivo.id]);
    // Y NO cuentan como activos en el vistazo, que es la otra mitad: se conservan
    // en las FILAS y se descuentan en la CIFRA.
    expect(resumenDelDia([cancelado, vivo], HOY, HOY, { conteo: 0, total: 0 }).activos).toBe(1);
  });

  it('LAS DOS CONSTANTES DE LA VENTANA SIGUEN DECLARADAS, y borrarlas apagaria el criterio 7', () => {
    // Se fueron a borrar con `agruparPorDia` y no se borraron. `VENTANA_ATRAS_DIAS`
    // es lo que hace que un aseo de ayer vivo y vencido llegue a
    // `alertasComputadas()`, y `HORIZONTE_DIAS` define el otro extremo de la misma
    // ventana, que es de donde sale el `+N en otros dias` del vistazo.
    expect(VENTANA_ATRAS_DIAS).toBe(7);
    expect(HORIZONTE_DIAS).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('bandejaSinConfirmar', () => {
  it('es el predicado literal de `cleanings_unconfirmed_idx` y nada más', () => {
    const enBandeja = fila({ is_managed: true, state: 'pendiente', confirmado_at: null });
    const yaConfirmado = fila({ confirmado_at: '2026-09-09T12:00:00+00:00' });
    const enCurso = fila({ state: 'en_curso' });
    const cancelado = fila({ state: 'cancelada' });
    const inerte = filaInerte({ state: null });

    const bandeja = bandejaSinConfirmar([yaConfirmado, enCurso, cancelado, inerte, enBandeja]);

    expect(ids(bandeja)).toEqual([enBandeja.id]);
  });

  it('ordena por fecha ascendente y adelanta a los urgentes DENTRO del día', () => {
    const urgenteDelViernes = fila({
      scheduled_date: dia(2),
      is_urgent: true,
      property: {
        id: 'a',
        nombre: 'Aaa',
        gestion_vivaguest: true,
        contacto_externo: null,
        hora_limite: '11:30:00',
      },
    });
    const normalDeHoy = fila({
      scheduled_date: HOY,
      property: {
        id: 'z',
        nombre: 'Zzz',
        gestion_vivaguest: true,
        contacto_externo: null,
        hora_limite: '11:30:00',
      },
    });
    const urgenteDeHoy = fila({
      scheduled_date: HOY,
      is_urgent: true,
      property: {
        id: 'm',
        nombre: 'Mmm',
        gestion_vivaguest: true,
        contacto_externo: null,
        hora_limite: '11:30:00',
      },
    });

    const bandeja = bandejaSinConfirmar([urgenteDelViernes, normalDeHoy, urgenteDeHoy]);

    // La urgencia adelanta dentro del día, NO salta días (UI-SPEC §9): el
    // urgente del viernes va último aunque sea urgente.
    expect(ids(bandeja)).toEqual([urgenteDeHoy.id, normalDeHoy.id, urgenteDelViernes.id]);
  });

  it('desempata por nombre de apartamento con la intercalación de es-CO', () => {
    const zipaquira = fila({
      property: {
        id: 'z',
        nombre: 'Zipaquirá 1',
        gestion_vivaguest: true,
        contacto_externo: null,
        hora_limite: '11:30:00',
      },
    });
    const alamos = fila({
      property: {
        id: 'a',
        nombre: 'Álamos 2',
        gestion_vivaguest: true,
        contacto_externo: null,
        hora_limite: '11:30:00',
      },
    });

    const bandeja = bandejaSinConfirmar([zipaquira, alamos]);

    // Con un `sort()` a secas, 'Álamos' (U+00C1) se ordena DESPUÉS de 'Zipaquirá'
    // porque se comparan puntos de código UTF-16.
    expect(ids(bandeja)).toEqual([alamos.id, zipaquira.id]);
  });

  it('no muta el array que recibe', () => {
    const a = fila({ scheduled_date: dia(2) });
    const b = fila({ scheduled_date: HOY });
    const entrada = [a, b];

    bandejaSinConfirmar(entrada);

    expect(ids(entrada)).toEqual([a.id, b.id]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const MARIA: AseadorDeChip = { id: 'ase-maria', full_name: 'María Gómez' };
const ANA: AseadorDeChip = { id: 'ase-ana', full_name: 'Ana Pérez' };
const LUIS: AseadorDeChip = { id: 'ase-luis', full_name: 'Luis Rojas' };

function conAseador(a: AseadorDeChip, parcial: Partial<FilaDeOperacion> = {}): FilaDeOperacion {
  return fila({
    aseador_id: a.id,
    aseador: { id: a.id, full_name: a.full_name },
    confirmado_at: '2026-09-09T12:00:00+00:00',
    ...parcial,
  });
}

describe('cargaPorAseador', () => {
  it('cuenta solo los aseos de HOY, gestionados y con estado vivo', () => {
    const chips = cargaPorAseador(
      [
        conAseador(MARIA, { scheduled_date: HOY, state: 'pendiente' }),
        conAseador(MARIA, { scheduled_date: HOY, state: 'en_curso', started_at: 'x' }),
        // Ninguno de estos cuatro cuenta:
        conAseador(MARIA, { scheduled_date: HOY, state: 'cancelada' }),
        conAseador(MARIA, { scheduled_date: HOY, state: 'completada' }),
        conAseador(MARIA, { scheduled_date: dia(1), state: 'pendiente' }),
        filaInerte({ scheduled_date: HOY }),
      ],
      HOY,
      [MARIA],
    );

    expect(chips).toEqual([{ aseadorId: MARIA.id, nombre: MARIA.full_name, conteo: 2 }]);
  });

  it('lista a los aseadores activos con conteo cero', () => {
    // "Quién está libre" es la mitad de la decisión del suplente (UI-SPEC §8.2).
    const chips = cargaPorAseador([conAseador(MARIA)], HOY, [MARIA, ANA, LUIS]);

    expect(chips).toEqual([
      { aseadorId: MARIA.id, nombre: MARIA.full_name, conteo: 1 },
      { aseadorId: ANA.id, nombre: ANA.full_name, conteo: 0 },
      { aseadorId: LUIS.id, nombre: LUIS.full_name, conteo: 0 },
    ]);
  });

  it('ordena por conteo descendente y después por nombre', () => {
    const chips = cargaPorAseador(
      [
        conAseador(LUIS),
        conAseador(LUIS),
        conAseador(MARIA),
        conAseador(ANA),
        conAseador(MARIA),
      ],
      HOY,
      [MARIA, ANA, LUIS],
    );

    // Empate a 2 entre Luis y María: desempata el nombre, y 'Luis' < 'María'.
    expect(chips.map((c) => [c.nombre, c.conteo])).toEqual([
      ['Luis Rojas', 2],
      ['María Gómez', 2],
      ['Ana Pérez', 1],
    ]);
  });

  it('emite `Sin asignar` solo si su conteo es mayor que cero', () => {
    const sinNadie = cargaPorAseador([conAseador(MARIA)], HOY, [MARIA]);
    expect(sinNadie.map((c) => c.nombre)).toEqual([MARIA.full_name]);

    const conHuerfano = cargaPorAseador(
      [conAseador(MARIA), fila({ aseador_id: null })],
      HOY,
      [MARIA],
    );
    expect(conHuerfano.map((c) => c.nombre)).toEqual([MARIA.full_name, SIN_ASIGNAR]);
  });

  it('`Sin asignar` va SIEMPRE último, sin importar su conteo', () => {
    const chips = cargaPorAseador(
      [
        fila({ aseador_id: null }),
        fila({ aseador_id: null }),
        fila({ aseador_id: null }),
        conAseador(MARIA),
      ],
      HOY,
      [MARIA],
    );

    expect(chips.map((c) => [c.nombre, c.conteo])).toEqual([
      ['María Gómez', 1],
      [SIN_ASIGNAR, 3],
    ]);
    expect(chips.at(-1)?.aseadorId).toBeNull();
  });

  it('un aseador DESACTIVADO con trabajo de hoy sigue apareciendo con su conteo', () => {
    // No está en la lista de activos, pero tiene dos aseos de hoy. Omitirlo
    // haría que la suma de los chips no cuadrara con las filas del día, y el
    // trabajo de esa persona desaparecería de la vista justo cuando hay que
    // reasignarlo.
    const chips = cargaPorAseador([conAseador(ANA), conAseador(ANA)], HOY, [MARIA]);

    expect(chips.map((c) => [c.nombre, c.conteo])).toEqual([
      ['Ana Pérez', 2],
      ['María Gómez', 0],
    ]);
  });

  it('la suma de los chips es exactamente el número de filas contadas', () => {
    const filas = [
      conAseador(MARIA),
      conAseador(ANA),
      fila({ aseador_id: null }),
      conAseador(MARIA, { state: 'cancelada' }),
      filaInerte(),
    ];

    const chips = cargaPorAseador(filas, HOY, [MARIA, ANA, LUIS]);

    expect(chips.reduce((suma, c) => suma + c.conteo, 0)).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cliente falso que registra lo que se le pidió y devuelve lo que se le diga.
 *
 * No pretende imitar a PostgREST: lo que se mide con él es el CONTRATO de la
 * llamada (qué tabla, qué columnas, qué límites de fecha), que es lo único que
 * un unitario puede afirmar sin base. Que ese contrato sea aceptable para
 * PostgREST lo prueba `operacion.integration.test.ts`, y no se puede probar
 * aquí: `PGRST201` es un error de servidor, no de tipos.
 */
function clienteFalso(filas: FilaDeOperacion[] = []) {
  const llamadas = {
    tabla: '',
    select: '',
    gte: [] as [string, unknown][],
    lte: [] as [string, unknown][],
    order: [] as [string, unknown][],
    rpc: [] as string[],
  };

  const builder = {
    select(sel: string) {
      llamadas.select = sel;
      return builder;
    },
    gte(columna: string, valor: unknown) {
      llamadas.gte.push([columna, valor]);
      return builder;
    },
    lte(columna: string, valor: unknown) {
      llamadas.lte.push([columna, valor]);
      return builder;
    },
    order(columna: string, opciones?: unknown) {
      llamadas.order.push([columna, opciones]);
      return builder;
    },
    then(resolver: (r: { data: FilaDeOperacion[]; error: null }) => unknown) {
      return resolver({ data: filas, error: null });
    },
  };

  const supabase = {
    from(tabla: string) {
      llamadas.tabla = tabla;
      return builder;
    },
    // La consulta en lote de la marca de evidencia (plan 06-10). El doble
    // responde vacio: los tests de este bloque miden la VENTANA y el ORDEN, no
    // la marca, y la marca tiene su propio bloque al final del archivo.
    async rpc(nombre: string) {
      llamadas.rpc.push(nombre);
      return { data: [], error: null };
    },
  };

  return { supabase, llamadas };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const comoCliente = (c: unknown) => c as any;

afterEach(() => {
  vi.useRealTimers();
});

describe('leerOperacion', () => {
  it('acota la ventana al día de negocio de BOGOTÁ, no al del proceso', () => {
    // 2026-09-11T01:00:00Z son las 20:00 del 10 de septiembre en Bogotá. La
    // suite corre con TZ=UTC, así que `new Date().toISOString().slice(0,10)`
    // devolvería '2026-09-11' y la ventana empezaría MAÑANA: el aseo de esta
    // noche desaparecería del bloque `Hoy` durante las cinco horas en las que
    // nadie está mirando la pantalla para descubrirlo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T01:00:00Z'));

    const { supabase, llamadas } = clienteFalso();
    return leerOperacion(comoCliente(supabase)).then((operacion) => {
      expect(operacion.hoy).toBe('2026-09-10');
      expect(operacion.horizonte).toBe('2026-09-16');
      // D-08: el límite inferior cuelga del MISMO día de negocio de Bogotá, solo
      // que siete días atrás. El señuelo de la zona sigue vivo: con el día del
      // proceso, esto sería '2026-09-04'.
      expect(llamadas.gte).toEqual([['scheduled_date', '2026-09-03']]);
      expect(llamadas.lte).toEqual([['scheduled_date', '2026-09-16']]);
    });

    it('D-08: el límite inferior baja SIETE días, no se queda en hoy', () => {
      // Si se queda en `hoy`, el aseo de ayer vivo y vencido nunca llega a
      // `alertasComputadas()` y el criterio 7 del ROADMAP sigue roto en la base
      // misma de la pantalla: no hay proyección que arregle lo que no se trajo.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-10T15:00:00Z'));

      const { supabase, llamadas } = clienteFalso();

      return leerOperacion(comoCliente(supabase)).then((operacion) => {
        const [[, limiteInferior]] = llamadas.gte;
        expect(limiteInferior).toBe(sumarDias(operacion.hoy, -VENTANA_ATRAS_DIAS));
        expect(limiteInferior).not.toBe(operacion.hoy);
      });
    });
  });

  it('califica los dos embeds por NOMBRE DE CLAVE FORÁNEA', async () => {
    const { supabase, llamadas } = clienteFalso();

    await leerOperacion(comoCliente(supabase));

    expect(llamadas.tabla).toBe('cleanings');
    // Sin el nombre de la FK, `profiles(...)` es ambiguo (dos claves foráneas
    // desde `cleanings`) y PostgREST responde PGRST201 en tiempo de ejecución.
    expect(llamadas.select).toContain('properties!cleanings_property_id_fkey');
    expect(llamadas.select).toContain('profiles!cleanings_aseador_id_fkey');
    // El select es explícito y no lleva `*`: ninguna columna de más viaja al
    // navegador (T-04-11).
    expect(llamadas.select).not.toContain('*');
  });

  it('ordena por fecha y después por hora límite', async () => {
    const { supabase, llamadas } = clienteFalso();

    await leerOperacion(comoCliente(supabase));

    expect(llamadas.order).toEqual([
      ['scheduled_date', { ascending: true }],
      ['hora_limite', { ascending: true }],
    ]);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // EL DIA PEDIDO AMPLIA LA VENTANA Y NO MUEVE SU EJE (D-05-1, plan 10-05)
  //
  // ── QUE DEFIENDE ESTE BLOQUE, Y POR QUE ES EL MAS IMPORTANTE DEL PLAN ────
  //
  // La ventana de catorce dias es la que alimenta `alertasComputadas()`, y en
  // particular la alerta de hora limite vencida, que es el criterio 7 del
  // ROADMAP y la unica que NO se acota por fecha. Si el selector de dia MOVIERA
  // el eje en vez de AMPLIAR la ventana, navegar a un dia pasado apagaria las
  // alertas de hoy: el admin se va a revisar el martes y las alertas vivas de
  // esta tarde desaparecen sin que nada lo diga.
  //
  // Por eso las tres afirmaciones son: el dia de dentro no mueve nada, el dia de
  // fuera empuja UN solo limite, y en los tres casos la ventana del eje sigue
  // CONTENIDA en la que se pide. Lo tercero es lo que ve el senuelo del eje.
  // ═════════════════════════════════════════════════════════════════════════

  describe('la ventana ante un dia pedido', () => {
    /** Las 15:00 UTC del dia de referencia son las 10:00 de Bogota del mismo dia. */
    const MEDIODIA_BOG = Date.parse(`${HOY}T15:00:00Z`);

    function limites(llamadas: { gte: [string, unknown][]; lte: [string, unknown][] }) {
      return {
        desde: llamadas.gte[0][1] as string,
        hasta: llamadas.lte[0][1] as string,
      };
    }

    const ARRANQUE = sumarDias(HOY, -VENTANA_ATRAS_DIAS);
    const HORIZONTE = sumarDias(HOY, HORIZONTE_DIAS);

    it('un dia DENTRO de la ventana pide el mismo rango de siempre', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(MEDIODIA_BOG));
      const { supabase, llamadas } = clienteFalso();

      return leerOperacion(comoCliente(supabase), MEDIODIA_BOG, dia(2)).then(() => {
        expect(limites(llamadas)).toEqual({ desde: ARRANQUE, hasta: HORIZONTE });
      });
    });

    it('un dia ANTERIOR al arranque baja el limite inferior y NO toca el superior', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(MEDIODIA_BOG));
      const { supabase, llamadas } = clienteFalso();
      const viejo = dia(-30);

      return leerOperacion(comoCliente(supabase), MEDIODIA_BOG, viejo).then(() => {
        expect(limites(llamadas)).toEqual({ desde: viejo, hasta: HORIZONTE });
      });
    });

    it('un dia POSTERIOR al horizonte sube el limite superior y NO toca el inferior', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(MEDIODIA_BOG));
      const { supabase, llamadas } = clienteFalso();
      const lejano = dia(40);

      return leerOperacion(comoCliente(supabase), MEDIODIA_BOG, lejano).then(() => {
        expect(limites(llamadas)).toEqual({ desde: ARRANQUE, hasta: lejano });
      });
    });

    it('LA VENTANA DE LAS ALERTAS NO SE ESTRECHA NUNCA, pida lo que pida el selector', async () => {
      // El eje sigue siendo `hoyBog()`: el rango de la consulta tiene que CONTENER
      // siempre `[hoy-7, hoy+6]`. Esta es la asercion que cae si alguien mueve el
      // eje al dia pedido en vez de ampliar la ventana, y con ella cae el criterio
      // 7 del ROADMAP.
      for (const pedido of [null, dia(-30), dia(-1), HOY, dia(3), dia(40)]) {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(MEDIODIA_BOG));
        const { supabase, llamadas } = clienteFalso();

        await leerOperacion(comoCliente(supabase), MEDIODIA_BOG, pedido);

        const { desde, hasta } = limites(llamadas);
        expect(
          desde <= ARRANQUE,
          `con ?dia=${pedido} el limite inferior subio a ${desde}, por encima de ${ARRANQUE}`,
        ).toBe(true);
        expect(
          hasta >= HORIZONTE,
          `con ?dia=${pedido} el limite superior bajo a ${hasta}, por debajo de ${HORIZONTE}`,
        ).toBe(true);
        vi.useRealTimers();
      }
    });

    it('sin dia pedido la ventana es exactamente la de siempre', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(MEDIODIA_BOG));
      const { supabase, llamadas } = clienteFalso();

      return leerOperacion(comoCliente(supabase), MEDIODIA_BOG).then(() => {
        expect(limites(llamadas)).toEqual({ desde: ARRANQUE, hasta: HORIZONTE });
      });
    });
  });

  it('devuelve las filas y UN SOLO instante de lectura', async () => {
    const unaFila = fila();
    const { supabase } = clienteFalso([unaFila]);

    const operacion = await leerOperacion(comoCliente(supabase), 1_700_000_000_000);

    expect(ids(operacion.filas)).toEqual([unaFila.id]);
    // D-14: la cabecera muestra UNA marca de tiempo. Si cada superficie trajera
    // la suya, no habría respuesta a "¿cuál se muestra?".
    expect(operacion.leidoEnMs).toBe(1_700_000_000_000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA MARCA DE EVIDENCIA INCOMPLETA — plan 06-10
//
// ── QUE MIDE ESTE BLOQUE ───────────────────────────────────────────────────
//
// D-06 permitio saltar un cuarto **a cambio de que el admin lo vea**. Esta es
// esa segunda mitad, y lo que se comprueba aqui es que llega a la fila sin
// gastar un viaje por aseo, y que se degrada en vez de tumbar la pantalla.
//
// Lo que NO mide: que la regla sea correcta. Eso vive en la base y lo compara
// `lib/domain/evidencia-paridad.integration.test.ts`.
// ════════════════════════════════════════════════════════════════════════════

describe('la marca de evidencia incompleta en la lectura', () => {
  type RespuestaRpc = { data: unknown; error: { message: string } | null };

  function clienteConAseos(filas: unknown[], rpcResponde: RespuestaRpc) {
    const orderFinal = vi.fn(async () => ({ data: filas, error: null }));
    const order1 = vi.fn(() => ({ order: orderFinal }));
    const lte = vi.fn(() => ({ order: order1 }));
    const gte = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ gte }));
    const from = vi.fn(() => ({ select }));
    const rpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<RespuestaRpc>>(
      async () => rpcResponde,
    );
    return { from, select, rpc };
  }

  const A = 'aseo-marcado';
  const B = 'aseo-limpio';

  function dosAseos() {
    return [
      { id: A, scheduled_date: HOY, state: 'completada', property: { id: 'p1' }, aseador: null },
      { id: B, scheduled_date: HOY, state: 'completada', property: { id: 'p1' }, aseador: null },
    ];
  }

  it('marca SOLO los aseos que la base devuelve, en un unico viaje', async () => {
    const c = clienteConAseos(dosAseos(), { data: [A], error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await leerOperacion(c as any, Date.parse(`${HOY}T15:00:00Z`));

    expect(r.filas.find((f) => f.id === A)?.sin_evidencia_completa).toBe(true);
    expect(r.filas.find((f) => f.id === B)?.sin_evidencia_completa).toBe(false);

    // UN viaje, no uno por aseo: es toda la razon de que exista la version en
    // lote de la migracion 21.
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc.mock.calls[0][0]).toBe('aseos_sin_evidencia_completa');
    expect(c.rpc.mock.calls[0][1]).toEqual({ p_cleanings: [A, B] });
  });

  it('si la consulta de la marca falla, la tabla se pinta igual', async () => {
    // La marca es una senal secundaria. Tumbar `/operacion` —la pantalla desde
    // la que el admin confirma y reasigna— porque no se pudo leer una senal
    // accesoria seria cambiar un dato que falta por una jornada sin herramienta.
    const c = clienteConAseos(dosAseos(), { data: null, error: { message: 'caida' } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await leerOperacion(c as any, Date.parse(`${HOY}T15:00:00Z`));

    expect(r.filas).toHaveLength(2);
    expect(r.filas.every((f) => f.sin_evidencia_completa === false)).toBe(true);
  });

  it('sin aseos en la ventana no pregunta nada', async () => {
    const c = clienteConAseos([], { data: [], error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await leerOperacion(c as any, Date.parse(`${HOY}T15:00:00Z`));

    expect(r.filas).toHaveLength(0);
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
