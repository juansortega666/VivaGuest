import { afterEach, describe, expect, it, vi } from 'vitest';

import { sumarDias } from '@/lib/domain/dates';

import {
  HORIZONTE_DIAS,
  SIN_ASIGNAR,
  VENTANA_ATRAS_DIAS,
  agruparPorDia,
  bandejaSinConfirmar,
  cargaPorAseador,
  leerOperacion,
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

describe('agruparPorDia', () => {
  it('parte las filas en Hoy, Mañana y los cinco días de Siguientes', () => {
    const deHoy = fila({ scheduled_date: HOY });
    const deManana = fila({ scheduled_date: dia(1) });
    const enDos = fila({ scheduled_date: dia(2) });
    const enSeis = fila({ scheduled_date: dia(6) });

    const bloques = agruparPorDia([enSeis, deManana, enDos, deHoy], HOY);

    expect(bloques.hoy.fecha).toBe(HOY);
    expect(ids(bloques.hoy.filas)).toEqual([deHoy.id]);

    expect(bloques.manana.fecha).toBe(dia(1));
    expect(ids(bloques.manana.filas)).toEqual([deManana.id]);

    // Cinco grupos: D+2 … D+6. Se emiten TODOS aunque estén vacíos, porque
    // UI-SPEC §8.1 pinta la cabecera del día con `0 aseos`: que hoy no haya
    // nada en un día es información, no un día que se oculta.
    expect(bloques.siguientes.map((g) => g.fecha)).toEqual([
      dia(2),
      dia(3),
      dia(4),
      dia(5),
      dia(6),
    ]);
    expect(ids(bloques.siguientes[0].filas)).toEqual([enDos.id]);
    expect(ids(bloques.siguientes[1].filas)).toEqual([]);
    expect(ids(bloques.siguientes[4].filas)).toEqual([enSeis.id]);
  });

  it('el horizonte es de seis días y lo que queda más lejos solo se cuenta', () => {
    expect(HORIZONTE_DIAS).toBe(6);

    const bloques = agruparPorDia(
      [
        fila({ scheduled_date: dia(7) }),
        fila({ scheduled_date: dia(20) }),
        fila({ scheduled_date: dia(6) }),
      ],
      HOY,
    );

    expect(bloques.ultimoDiaDelHorizonte).toBe(dia(6));
    expect(bloques.masAllaDelHorizonte).toBe(2);
    // Y no se cuelan en ningún grupo.
    expect(bloques.siguientes.flatMap((g) => g.filas)).toHaveLength(1);
  });

  // ESTE TEST DECÍA LO CONTRARIO HASTA D-08, y decirlo era el defecto: un aseo
  // de ayer vivo y vencido no aparecía en ninguna parte, así que la alerta que
  // `alertasComputadas()` sí sabía producir no tenía dónde aterrizar. Criterio 7
  // del ROADMAP. Lo que se conserva intacto es la otra mitad de la aserción: un
  // aseo anterior a hoy NO se cuela en `hoy`, ni en `mañana`, ni en `siguientes`,
  // ni en el conteo del horizonte.
  it('un aseo de AYER va al bloque Atrasados y a ningún otro', () => {
    const deAyer = fila({ scheduled_date: dia(-1) });
    const deHoy = fila({ scheduled_date: HOY });

    const bloques = agruparPorDia([deAyer, deHoy], HOY);

    expect(bloques.atrasados.map((g) => g.fecha)).toEqual([dia(-1)]);
    expect(ids(bloques.atrasados[0].filas)).toEqual([deAyer.id]);

    expect(ids(bloques.hoy.filas)).toEqual([deHoy.id]);
    expect(bloques.manana.filas).toHaveLength(0);
    expect(bloques.siguientes.flatMap((g) => g.filas)).toHaveLength(0);
    expect(bloques.masAllaDelHorizonte).toBe(0);
  });

  it('conserva el orden de entrada dentro de cada día', () => {
    // La consulta ya viene ordenada por `scheduled_date` y luego `hora_limite`.
    // Reordenar aquí desharía ese orden y la columna de horas dejaría de subir.
    const tarde = fila({ scheduled_date: HOY, hora_limite: '15:00:00' });
    const temprano = fila({ scheduled_date: HOY, hora_limite: '09:00:00' });

    const bloques = agruparPorDia([temprano, tarde], HOY);

    expect(ids(bloques.hoy.filas)).toEqual([temprano.id, tarde.id]);
  });

  it('las filas de gestión externa van en los mismos bloques, no aparte', () => {
    const inerte = filaInerte({ scheduled_date: HOY });
    const gestionado = fila({ scheduled_date: HOY });

    const bloques = agruparPorDia([gestionado, inerte], HOY);

    expect(ids(bloques.hoy.filas)).toEqual([gestionado.id, inerte.id]);
  });

  it('los cancelados SE conservan: la cabecera del día necesita su conteo', () => {
    const cancelado = fila({ scheduled_date: HOY, state: 'cancelada' });

    const bloques = agruparPorDia([cancelado], HOY);

    expect(ids(bloques.hoy.filas)).toEqual([cancelado.id]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('agruparPorDia · Atrasados (D-08, criterio 7)', () => {
  /**
   * EL SEÑUELO CENTRAL DE D-08, Y HAY QUE DECIR POR QUÉ.
   *
   * Hay DOS filtros de fecha en `operacion.ts`, no uno: el `.gte()` de la
   * consulta y el descarte que esta proyección hacía por su cuenta. Ampliar
   * SOLO la consulta deja este grupo vacío y el defecto exactamente igual de
   * vivo, con la sensación de estar arreglado. Este test se corrió en rojo con
   * el `if (fecha < hoy) continue;` restaurado a mano, precisamente para medir
   * que atrapa esa mitad.
   */
  it('AGRUPA lo anterior a hoy POR DÍA y en orden ascendente, no en una lista corrida', () => {
    const deAyer = fila({ scheduled_date: dia(-1) });
    const deHaceTres = fila({ scheduled_date: dia(-3) });
    const otroDeHaceTres = fila({ scheduled_date: dia(-3), hora_limite: '15:00:00' });

    const bloques = agruparPorDia([deAyer, deHaceTres, otroDeHaceTres], HOY);

    // Por día, ascendente: lo más viejo arriba. Una lista corrida perdería la
    // fecha, que es el dato que dice cuán viejo es (UI-SPEC §12.2).
    expect(bloques.atrasados.map((g) => g.fecha)).toEqual([dia(-3), dia(-1)]);
    expect(ids(bloques.atrasados[0].filas)).toEqual([deHaceTres.id, otroDeHaceTres.id]);
    expect(ids(bloques.atrasados[1].filas)).toEqual([deAyer.id]);
  });

  it('solo emite los días QUE TIENEN algo: un día viejo sin aseos no pinta cabecera', () => {
    // Al revés que `Siguientes`, que emite sus cinco días vacíos incluidos. Un
    // día pasado sin aseos no es información: es que no había nada que hacer
    // (UI-SPEC §12.3, misma razón por la que el bloque entero desaparece vacío).
    const bloques = agruparPorDia([fila({ scheduled_date: dia(-2) })], HOY);

    expect(bloques.atrasados.map((g) => g.fecha)).toEqual([dia(-2)]);
  });

  it('solo entran los VIVOS y GESTIONADOS: terminado, cancelado y externo quedan fuera', () => {
    // Un aseo terminado o cancelado de ayer no está atrasado: está cerrado
    // (UI-SPEC §12.2). Y una unidad de gestión externa no la opera VivaGuest,
    // así que no hay nada que el admin pueda hacer al respecto.
    const vivo = fila({ scheduled_date: dia(-1), state: 'pendiente' });
    const enCurso = fila({ scheduled_date: dia(-1), state: 'en_curso' });
    const terminado = fila({ scheduled_date: dia(-1), state: 'completada' });
    const cancelado = fila({ scheduled_date: dia(-1), state: 'cancelada' });
    const externo = filaInerte({ scheduled_date: dia(-1) });

    const bloques = agruparPorDia([vivo, enCurso, terminado, cancelado, externo], HOY);

    expect(bloques.atrasados).toHaveLength(1);
    expect(ids(bloques.atrasados[0].filas)).toEqual([vivo.id, enCurso.id]);
  });

  it('el tope es de SIETE días: lo de hace ocho no se agrupa, solo se cuenta', () => {
    expect(VENTANA_ATRAS_DIAS).toBe(7);

    const enElBorde = fila({ scheduled_date: dia(-7) });
    const fuera = fila({ scheduled_date: dia(-8) });
    const muyFuera = fila({ scheduled_date: dia(-40) });
    // Uno cerrado de hace un mes NO es "sin cerrar": no entra en el conteo.
    const cerradoViejo = fila({ scheduled_date: dia(-40), state: 'completada' });

    const bloques = agruparPorDia([enElBorde, fuera, muyFuera, cerradoViejo], HOY);

    expect(bloques.atrasados.map((g) => g.fecha)).toEqual([dia(-7)]);
    expect(bloques.primerDiaDeLaVentana).toBe(dia(-7));
    expect(bloques.antesDeLaVentana).toBe(2);
  });

  it('expone la fecha del atrasado MÁS VIEJO, que es lo que la cabecera necesita', () => {
    // `3 aseos` a secas no es una decisión; `3 aseos · el más viejo del 4 de
    // septiembre` sí (UI-SPEC §12.2).
    const bloques = agruparPorDia(
      [fila({ scheduled_date: dia(-1) }), fila({ scheduled_date: dia(-5) })],
      HOY,
    );

    expect(bloques.masViejoAtrasado).toBe(dia(-5));
  });

  it('sin nada atrasado el grupo sale vacío y sin fecha: el bloque no se renderiza', () => {
    const bloques = agruparPorDia([fila({ scheduled_date: HOY })], HOY);

    expect(bloques.atrasados).toEqual([]);
    expect(bloques.antesDeLaVentana).toBe(0);
    expect(bloques.masViejoAtrasado).toBeNull();
  });

  it('NO toca los tres bloques existentes ni el conteo del horizonte', () => {
    // T-05-56: la regresión silenciosa del carril es el riesgo real de este
    // cambio. Mismo conjunto de filas, mismas tres proyecciones de siempre.
    const deAyer = fila({ scheduled_date: dia(-1) });
    const deHoy = fila({ scheduled_date: HOY });
    const deManana = fila({ scheduled_date: dia(1) });
    const enTres = fila({ scheduled_date: dia(3) });
    const lejos = fila({ scheduled_date: dia(30) });

    const bloques = agruparPorDia([deAyer, deHoy, deManana, enTres, lejos], HOY);

    expect(ids(bloques.hoy.filas)).toEqual([deHoy.id]);
    expect(ids(bloques.manana.filas)).toEqual([deManana.id]);
    expect(bloques.siguientes.map((g) => g.fecha)).toHaveLength(HORIZONTE_DIAS - 1);
    expect(ids(bloques.siguientes[1].filas)).toEqual([enTres.id]);
    expect(bloques.ultimoDiaDelHorizonte).toBe(dia(6));
    expect(bloques.masAllaDelHorizonte).toBe(1);
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
