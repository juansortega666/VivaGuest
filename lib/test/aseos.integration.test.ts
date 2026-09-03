import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  leerAseo,
  limpiarAseos,
  sembrarEscenarioDeAseos,
  sumarDias,
  type EscenarioDeAseos,
} from './aseos';
import { clienteAdminDePruebas } from './clientes';

/**
 * EL TEST QUE PRUEBA AL ARNÉS.
 *
 * Existe por una razón concreta: `lib/test/aseos.ts` va a sostener las veinte y
 * pico aserciones de integración del dashboard. Un arnés sin verificación es
 * código de producción disfrazado de utilidad, y cuando falla no falla solo: se
 * lleva por delante todos los tests que se apoyan en él, y el síntoma aparece
 * en el archivo equivocado.
 *
 * Las cuatro propiedades que se miden son las cuatro del contrato:
 *
 *   1. el escenario deja los once objetos, NOMBRADOS y distinguibles;
 *   2. las fechas salen de la base y no del proceso;
 *   3. `leerAseo` devuelve la fila cruda, sin embeds;
 *   4. `limpiarAseos` borra lo suyo y es idempotente.
 *
 * El orden de los tests IMPORTA y no es casual: el cuarto destruye el escenario
 * que usan los tres primeros. Vitest ejecuta los tests de un archivo en orden de
 * declaración, y la suite corre con `fileParallelism: false` contra un stack
 * local que es UNO solo y compartido entre worktrees.
 */

let escenario: EscenarioDeAseos;

beforeAll(async () => {
  escenario = await sembrarEscenarioDeAseos();
});

afterAll(async () => {
  // Incondicional e idempotente: si el test 4 ya limpió, esta llamada no hace
  // nada. Si un test anterior explotó, esta es la que impide dejar basura para
  // el archivo siguiente.
  await limpiarAseos();
});

describe('sembrarEscenarioDeAseos', () => {
  test('deja los once objetos del escenario, cada uno identificable por nombre', () => {
    const ids = [
      escenario.aptoGestionado,
      escenario.aptoExterno,
      escenario.aseadorA,
      escenario.aseadorB,
      escenario.aseadorInactivo,
      escenario.aseoSinConfirmar,
      escenario.aseoPendiente,
      escenario.aseoEnCurso,
      escenario.aseoTerminado,
      escenario.aseoCancelado,
      escenario.aseoInerte,
    ];

    expect(ids).toHaveLength(11);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // Once uuid DISTINTOS. Sin esto, un arnés que devolviera el mismo id en dos
    // ranuras pasaría la comprobación de forma de arriba sin problema, y el
    // test que se apoyara en las dos mediría una sola fila creyendo que son dos.
    expect(new Set(ids).size).toBe(11);
  });

  test('cada aseo tiene la FORMA de su estado, que es lo que exigen los CHECK de la migración 04', async () => {
    const sinConfirmar = await leerAseo(escenario.aseoSinConfirmar);
    const pendiente = await leerAseo(escenario.aseoPendiente);
    const enCurso = await leerAseo(escenario.aseoEnCurso);
    const terminado = await leerAseo(escenario.aseoTerminado);
    const cancelado = await leerAseo(escenario.aseoCancelado);
    const inerte = await leerAseo(escenario.aseoInerte);

    // El de la bandeja DASH-02: pendiente y todavía sin confirmar.
    expect(sinConfirmar?.state).toBe('pendiente');
    expect(sinConfirmar?.confirmado_at).toBeNull();
    expect(sinConfirmar?.aseador_id).toBeNull();

    // Confirmado es asignado en firme: las dos cosas van juntas (ASEO-03).
    expect(pendiente?.state).toBe('pendiente');
    expect(pendiente?.confirmado_at).not.toBeNull();
    expect(pendiente?.aseador_id).toBe(escenario.aseadorA);

    // `cl_en_curso_shape`: confirmado, con aseador, empezado y sin terminar.
    expect(enCurso?.state).toBe('en_curso');
    expect(enCurso?.started_at).not.toBeNull();
    expect(enCurso?.finished_at).toBeNull();

    // `cl_completada_shape`: las dos marcas, y el fin no anterior al inicio.
    expect(terminado?.state).toBe('completada');
    expect(terminado?.started_at).not.toBeNull();
    expect(terminado?.finished_at).not.toBeNull();
    expect(
      new Date(terminado!.finished_at!).getTime() >= new Date(terminado!.started_at!).getTime(),
    ).toBe(true);

    // `cl_cancelada_shape`. El motivo es un slug del sync a propósito: si la
    // fixture trajera `cancelado_por_admin` ya puesto, un `cancel_cleaning` que
    // no escribiera nada pasaría igual sus aserciones.
    expect(cancelado?.state).toBe('cancelada');
    expect(cancelado?.cancelled_at).not.toBeNull();
    expect(cancelado?.cancel_reason).toBe('reserva_desaparecida');

    // `cl_unmanaged_is_inert` (DASH-07): sin estado, sin aseador, sin tarifas.
    expect(inerte?.is_managed).toBe(false);
    expect(inerte?.state).toBeNull();
    expect(inerte?.aseador_id).toBeNull();
    expect(inerte?.tarifa_huesped).toBeNull();
    expect(inerte?.pago_aseador).toBeNull();

    // El snapshot del trigger copió la hora del apartamento (10:15) y no el
    // default del schema (11:30). Es la propiedad que hace útil a la fixture.
    expect(pendiente?.hora_limite).toBe('10:15:00');
    expect(pendiente?.is_managed).toBe(true);
    expect(pendiente?.tarifa_huesped).toBe(120000);
    expect(pendiente?.pago_aseador).toBe(45000);
  });

  test('el cancelado comparte fecha con el aseo en curso: el índice único es PARCIAL', async () => {
    const enCurso = await leerAseo(escenario.aseoEnCurso);
    const cancelado = await leerAseo(escenario.aseoCancelado);

    expect(cancelado?.scheduled_date).toBe(enCurso?.scheduled_date);
    expect(cancelado?.property_id).toBe(enCurso?.property_id);
  });

  test('el arnés NO siembra feeds ni reservas: los aseos nacen sin reservation_id', async () => {
    // Es el contrato explícito del módulo. Si algún día alguien le añade la
    // siembra de feeds "por comodidad", esta aserción lo atrapa: el escenario
    // del Pitfall 1 (plan 04-07) se compone con `lib/test/sync.ts`, no se
    // duplica aquí.
    const pendiente = await leerAseo(escenario.aseoPendiente);
    expect(pendiente?.reservation_id).toBeNull();

    const { count, error } = await clienteAdminDePruebas()
      .from('calendar_feeds')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', escenario.aptoGestionado);

    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});

describe('las fechas salen de public.today_bog(), no del reloj del proceso', () => {
  test('el día base del escenario es el que dice la base', async () => {
    const { data, error } = await clienteAdminDePruebas().rpc('today_bog');

    expect(error).toBeNull();
    expect(escenario.fechas.hoy).toBe(data);
  });

  test('los aseos quedaron en ayer, hoy, mañana y hoy+3, medidos contra ese día base', async () => {
    const terminado = await leerAseo(escenario.aseoTerminado);
    const enCurso = await leerAseo(escenario.aseoEnCurso);
    const sinConfirmar = await leerAseo(escenario.aseoSinConfirmar);
    const pendiente = await leerAseo(escenario.aseoPendiente);

    expect(terminado?.scheduled_date).toBe(escenario.fechas.ayer);
    expect(enCurso?.scheduled_date).toBe(escenario.fechas.hoy);
    expect(sinConfirmar?.scheduled_date).toBe(escenario.fechas.manana);
    expect(pendiente?.scheduled_date).toBe(escenario.fechas.enTresDias);
  });

  test('sumarDias cruza mes, año y bisiesto sin desviarse', () => {
    // Los tres casos donde la resta de 86 400 000 milisegundos a pelo falla, y
    // donde nadie tiene un test hasta que se le cae encima.
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDias('2028-03-01', -1)).toBe('2028-02-29');
    expect(sumarDias('2026-09-03', 0)).toBe('2026-09-03');
  });
});

describe('leerAseo', () => {
  test('devuelve la fila cruda de cleanings, sin ningún embed', async () => {
    const fila = await leerAseo(escenario.aseoPendiente);

    expect(fila).not.toBeNull();
    expect(fila?.id).toBe(escenario.aseoPendiente);

    // Las columnas de la tabla, presentes. Se comprueba la PRESENCIA de la
    // clave y no su valor: `confirmado_by` puede ser nulo y seguir estando.
    for (const columna of [
      'property_id',
      'reservation_id',
      'is_managed',
      'origin',
      'tipo',
      'state',
      'scheduled_date',
      'hora_limite',
      'needs_review',
      'aseador_id',
      'confirmado_at',
      'started_at',
      'finished_at',
      'cancelled_at',
      'tarifa_huesped',
      'pago_aseador',
      'updated_at',
    ]) {
      expect(fila).toHaveProperty(columna);
    }

    // Y NINGÚN embed. `cleanings` tiene dos claves foráneas hacia `profiles`
    // (`aseador_id` y `confirmado_by`), así que un embed sin calificar devuelve
    // PGRST201 en tiempo de EJECUCIÓN, no de compilación: se descubre en el
    // primer render y no en `tsc`. Además, un embed rompería la comparación
    // byte a byte de la fila antes y después de una mutación, que es para lo
    // que existe esta función.
    expect(fila).not.toHaveProperty('properties');
    expect(fila).not.toHaveProperty('profiles');
    expect(fila).not.toHaveProperty('aseador');
  });

  test('devuelve null para un aseo que no existe, en vez de lanzar', async () => {
    // Es lo que permite afirmar "la creación denegada no creó nada" con una
    // sola llamada, sin envolverla en un try.
    const fila = await leerAseo('00000000-0000-4000-8000-0000000000ff');
    expect(fila).toBeNull();
  });
});

describe('limpiarAseos', () => {
  test('borra lo que sembró, y una segunda llamada no hace nada ni lanza', async () => {
    const admin = clienteAdminDePruebas();

    // CONTROL POSITIVO: sin esto, un `limpiarAseos` que no borrara nada pasaría
    // todas las aserciones de ausencia de abajo con el escenario ya vacío.
    expect(await leerAseo(escenario.aseoPendiente)).not.toBeNull();

    await limpiarAseos();

    expect(await leerAseo(escenario.aseoPendiente)).toBeNull();
    expect(await leerAseo(escenario.aseoInerte)).toBeNull();

    const { data: propiedades, error: errorProps } = await admin
      .from('properties')
      .select('id')
      .in('id', [escenario.aptoGestionado, escenario.aptoExterno]);

    expect(errorProps).toBeNull();
    expect(propiedades).toEqual([]);

    // Los perfiles caen por cascade desde `auth.users`. Se comprueba aparte
    // porque `properties.responsable_id` es `on delete restrict`: si el orden de
    // borrado se invirtiera, el apartamento sí desaparecería y el perfil no.
    const { data: perfiles, error: errorPerfiles } = await admin
      .from('profiles')
      .select('id')
      .in('id', [escenario.aseadorA, escenario.aseadorB, escenario.aseadorInactivo]);

    expect(errorPerfiles).toBeNull();
    expect(perfiles).toEqual([]);

    // IDEMPOTENCIA. La segunda llamada es la que va a ocurrir de verdad: en el
    // `afterAll` de cualquier suite que ya haya limpiado en el camino de error.
    await expect(limpiarAseos()).resolves.toBeUndefined();
    await expect(limpiarAseos()).resolves.toBeUndefined();
  });
});
