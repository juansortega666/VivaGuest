import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  leerAseo,
  limpiarAseos,
  sembrarPeriodoCompleto,
  sumarDias,
  type EscenarioFinanciero,
} from './aseos';
import { clienteAdminDePruebas } from './clientes';

/**
 * EL TEST QUE PRUEBA AL SEMBRADOR DE PERIODO FINANCIERO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO ES LA ÚNICA PIEZA DE LA WAVE 0 QUE NACE EN VERDE, Y POR UNA
 * RAZÓN: el resto de la wave se apoya en el escenario que este sembrador deja.
 *
 * Un arnés sin verificación es código de producción disfrazado de utilidad, y
 * cuando falla no falla solo: se lleva por delante todos los tests que se
 * apoyan en él, y el síntoma aparece en el archivo equivocado.
 *
 * ── POR QUÉ VIVE EN UN ARCHIVO HERMANO Y NO EN `aseos.integration.test.ts` ──
 *
 * Porque el último bloque de aquel archivo DESTRUYE el escenario a propósito
 * para medir la limpieza, y los registros de lo sembrado son de módulo. Meter
 * dos escenarios con ciclos de vida distintos en el mismo archivo obliga a
 * sembrar los dos en cada corrida y hace que el orden de declaración de los
 * bloques sea parte del contrato. Vitest aísla módulos por archivo, así que
 * cada uno arranca con sus registros vacíos.
 *
 * Y sí, la suite corre con `fileParallelism: false`: el stack local es UNO solo
 * y compartido entre worktrees.
 * ════════════════════════════════════════════════════════════════════════════
 */

let escenario: EscenarioFinanciero;

beforeAll(async () => {
  escenario = await sembrarPeriodoCompleto();
});

afterAll(async () => {
  // Incondicional e idempotente. Si un test explotó a mitad, esta es la que
  // impide dejar basura para el archivo siguiente.
  await limpiarAseos();
});

/** Minutos del día de Bogotá de un instante, sin depender de la zona del proceso. */
function horaBogotaDe(instante: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  }).format(new Date(instante));
}

/** El día calendario DE BOGOTÁ al que pertenece un instante. */
function diaBogotaDe(instante: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(instante));
}

/** El día calendario UNIVERSAL al que pertenece un instante. Es el día equivocado. */
function diaUniversalDe(instante: string): string {
  return new Date(instante).toISOString().slice(0, 10);
}

describe('sembrarPeriodoCompleto', () => {
  test('deja los catorce objetos del escenario, cada uno identificable por nombre', () => {
    const ids = [
      escenario.aptoUno,
      escenario.aptoDos,
      escenario.aptoExterno,
      escenario.aseadoraUno,
      escenario.aseadoraDos,
      escenario.aseadoraDeBaja,
      escenario.aseoAlFiloDelCierre,
      escenario.aseoDeLaMadrugadaSiguiente,
      escenario.aseoProgramadoEnOtroPeriodo,
      escenario.aseoConGasto,
      escenario.aseoConDano,
      escenario.aseoDeLaAseadoraDeBaja,
      escenario.aseoSinCompletar,
      escenario.aseoExterno,
    ];

    expect(ids).toHaveLength(14);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // Catorce uuid DISTINTOS. Sin esto, un arnés que devolviera el mismo id en
    // dos ranuras pasaría la comprobación de forma de arriba, y el test que se
    // apoyara en las dos mediría una sola fila creyendo que son dos.
    expect(new Set(ids).size).toBe(14);
  });

  test('el periodo se calcula y está CERRADO: ninguna fecha del escenario cae en el futuro', () => {
    // Es la propiedad que impide que la suite empiece a fallar sola el año que
    // viene, y también la que impide un escenario que el cierre real nunca
    // produce: un aseo terminado mañana.
    expect(escenario.periodo.desde < escenario.periodo.hasta).toBe(true);
    expect(escenario.fechas.cierre).toBe(escenario.periodo.hasta);
    expect(escenario.fechas.diaSiguienteAlCierre).toBe(sumarDias(escenario.fechas.cierre, 1));
    expect(escenario.fechas.ejecucionTardia).toBe(sumarDias(escenario.fechas.cierre, 3));

    // La más tardía de todas las fechas sembradas, contra el día que dice la
    // base. Estricto: el escenario entero pertenece al pasado.
    expect(escenario.fechas.ejecucionTardia < escenario.fechas.hoy).toBe(true);

    // Y el periodo tiene la forma de un mes: ni un rango de dos días ni uno de
    // cuarenta. Febrero da veintisiete y un mes de treinta y un días da treinta.
    const dias =
      (Date.parse(`${escenario.periodo.hasta}T00:00:00Z`) -
        Date.parse(`${escenario.periodo.desde}T00:00:00Z`)) /
      86_400_000;
    expect(dias).toBeGreaterThanOrEqual(25);
    expect(dias).toBeLessThanOrEqual(32);
  });

  test('el día de cierre es un día HÁBIL: nunca sábado ni domingo', () => {
    // 0 es domingo y 6 es sábado. Se lee en UTC sobre un día calendario ya
    // resuelto, que es aritmética de calendario y no conversión de zona.
    const dia = new Date(`${escenario.fechas.cierre}T00:00:00Z`).getUTCDay();
    expect(dia).not.toBe(0);
    expect(dia).not.toBe(6);
  });

  test('el día base sale de public.today_bog(), no del reloj del proceso', async () => {
    const { data, error } = await clienteAdminDePruebas().rpc('today_bog');

    expect(error).toBeNull();
    expect(escenario.fechas.hoy).toBe(data);
  });

  test('acepta el periodo por parámetro, para que el autoritativo sea el de Postgres', async () => {
    // El arnés NO puede ser una tercera opinión sobre cuándo cierra el mes. La
    // capa de integración le pasa el periodo que devuelve la base y el arnés lo
    // respeta tal cual. Se elige un cierre en día hábil conocido y en el pasado.
    const otro = await sembrarPeriodoCompleto({
      periodo: { desde: '2026-01-02', hasta: '2026-01-30' },
    });

    expect(otro.periodo).toEqual({ desde: '2026-01-02', hasta: '2026-01-30' });
    expect(otro.fechas.cierre).toBe('2026-01-30');
    expect(otro.fechas.diaSiguienteAlCierre).toBe('2026-01-31');

    const filo = await leerAseo(otro.aseoAlFiloDelCierre);
    expect(filo?.scheduled_date).toBe('2026-01-30');
    expect(horaBogotaDe(filo!.finished_at!)).toBe('23:30');
  });
});

describe('el caso que decide la corrección de la fase: las 23:30 de Bogotá del día de cierre', () => {
  test('el aseo del filo se terminó a las 23:30 de Bogotá, y en tiempo universal YA es el día siguiente', async () => {
    const filo = await leerAseo(escenario.aseoAlFiloDelCierre);

    expect(filo?.state).toBe('completada');
    expect(filo?.scheduled_date).toBe(escenario.fechas.cierre);
    expect(horaBogotaDe(filo!.finished_at!)).toBe('23:30');

    // EL PUNTO ENTERO DEL ESCENARIO. El día de negocio es el del cierre; el día
    // universal es el siguiente. Una implementación que tome la fecha sin
    // convertir a hora de Bogotá manda este aseo al periodo equivocado, y como
    // un periodo cerrado no se recalcula nunca, el error es permanente y le
    // cambia el pago a una persona.
    expect(diaBogotaDe(filo!.finished_at!)).toBe(escenario.fechas.cierre);
    expect(diaUniversalDe(filo!.finished_at!)).toBe(escenario.fechas.diaSiguienteAlCierre);
    expect(diaUniversalDe(filo!.finished_at!)).not.toBe(diaBogotaDe(filo!.finished_at!));
  });

  test('su espejo se terminó a las 00:30 de Bogotá del día siguiente, y ahí los dos días SÍ coinciden', async () => {
    const espejo = await leerAseo(escenario.aseoDeLaMadrugadaSiguiente);

    expect(espejo?.state).toBe('completada');
    expect(horaBogotaDe(espejo!.finished_at!)).toBe('00:30');
    expect(diaBogotaDe(espejo!.finished_at!)).toBe(escenario.fechas.diaSiguienteAlCierre);

    // Sin el espejo, una implementación que desplazara TODO un día pasaría el
    // caso de arriba y seguiría estando mal. Aquí el día universal y el de
    // Bogotá coinciden, así que ese desplazamiento se delata.
    expect(diaUniversalDe(espejo!.finished_at!)).toBe(escenario.fechas.diaSiguienteAlCierre);

    // Y pertenece al periodo SIGUIENTE: está fuera del rango sembrado.
    expect(escenario.fechas.diaSiguienteAlCierre > escenario.periodo.hasta).toBe(true);
  });

  test('los dos aseos del filo distan una hora y están en periodos distintos', async () => {
    const filo = await leerAseo(escenario.aseoAlFiloDelCierre);
    const espejo = await leerAseo(escenario.aseoDeLaMadrugadaSiguiente);

    const distanciaMinutos =
      (Date.parse(espejo!.finished_at!) - Date.parse(filo!.finished_at!)) / 60_000;

    // Sesenta minutos de reloj, y sin embargo un cierre de periodo en medio. Es
    // exactamente la clase de frontera que una prueba con fechas cómodas nunca
    // ejerce.
    expect(distanciaMinutos).toBe(60);
  });
});

describe('los demás casos borde del periodo', () => {
  test('hay un aseo cuya fecha programada y cuya fecha de ejecución caen en periodos distintos', async () => {
    const cruzado = await leerAseo(escenario.aseoProgramadoEnOtroPeriodo);

    expect(cruzado?.state).toBe('completada');

    // Programado DENTRO del periodo.
    expect(cruzado!.scheduled_date >= escenario.periodo.desde).toBe(true);
    expect(cruzado!.scheduled_date <= escenario.periodo.hasta).toBe(true);

    // Ejecutado FUERA, en el siguiente. Cuenta en el periodo en que se terminó
    // (D7-8), y el desglose lo pinta con las dos fechas: sin la segunda, un
    // aseo de enero en el recibo de febrero parece un error.
    expect(diaBogotaDe(cruzado!.finished_at!)).toBe(escenario.fechas.ejecucionTardia);
    expect(escenario.fechas.ejecucionTardia > escenario.periodo.hasta).toBe(true);
    expect(cruzado!.scheduled_date).not.toBe(diaBogotaDe(cruzado!.finished_at!));
  });

  test('hay un aseo del periodo que queda SIN COMPLETAR', async () => {
    const colgado = await leerAseo(escenario.aseoSinCompletar);

    expect(colgado?.state).toBe('pendiente');
    expect(colgado?.confirmado_at).not.toBeNull();
    expect(colgado?.aseador_id).toBe(escenario.aseadoraDos);

    // `cl_pendiente_shape`: las dos marcas de ejecución nulas. Es lo que lo hace
    // no computable, y lo que alimenta el contador de no computados.
    expect(colgado?.started_at).toBeNull();
    expect(colgado?.finished_at).toBeNull();

    expect(colgado!.scheduled_date >= escenario.periodo.desde).toBe(true);
    expect(colgado!.scheduled_date <= escenario.periodo.hasta).toBe(true);
  });

  test('hay un gasto con su fila de foto de recibo, y la ruta respeta la convención de Storage', async () => {
    const admin = clienteAdminDePruebas();

    const { data: gasto, error } = await admin
      .from('expenses')
      .select('id, cleaning_id, property_id, monto, reported_by')
      .eq('id', escenario.gasto.id)
      .single();

    expect(error).toBeNull();
    expect(gasto?.cleaning_id).toBe(escenario.aseoConGasto);
    expect(gasto?.property_id).toBe(escenario.aptoUno);
    expect(gasto?.reported_by).toBe(escenario.aseadoraUno);

    // Pesos ENTEROS y como NÚMERO. `bigint` cabe en un entero seguro de
    // JavaScript a estas magnitudes, así que aquí no hay cadena. La cadena
    // aparece en las SUMAS, que es otra historia y otro test.
    expect(gasto?.monto).toBe(escenario.gasto.monto);
    expect(typeof gasto?.monto).toBe('number');
    expect(Number.isInteger(gasto?.monto)).toBe(true);

    const { data: foto, error: errorFoto } = await admin
      .from('cleaning_photos')
      .select('id, kind, expense_id, storage_bucket, storage_path, deleted_at')
      .eq('id', escenario.gasto.fotoId)
      .single();

    expect(errorFoto).toBeNull();
    expect(foto?.kind).toBe('gasto');
    expect(foto?.expense_id).toBe(escenario.gasto.id);
    expect(foto?.storage_bucket).toBe('evidencia');
    expect(foto?.deleted_at).toBeNull();

    // `{cleaning_id}/{kind}/{uuid}.{ext}`. El primer segmento DEBE ser el aseo:
    // las policies de Storage autorizan comparándolo, así que otra forma rompe
    // la autorización en silencio.
    expect(foto?.storage_path).toBe(escenario.gasto.storagePath);
    expect(foto!.storage_path.split('/')[0]).toBe(escenario.aseoConGasto);
    expect(foto!.storage_path.split('/')[1]).toBe('gasto');
  });

  test('hay al menos un daño, colgado de un aseo completado del periodo', async () => {
    const { data, error } = await clienteAdminDePruebas()
      .from('damages')
      .select('id, cleaning_id, property_id, reported_by, resolved_at')
      .eq('id', escenario.dano)
      .single();

    expect(error).toBeNull();
    expect(data?.cleaning_id).toBe(escenario.aseoConDano);
    expect(data?.property_id).toBe(escenario.aptoDos);
    expect(data?.reported_by).toBe(escenario.aseadoraDos);
    // Abierto: es lo que cuenta el bloque 2. Y no descuenta del pago (D7-2).
    expect(data?.resolved_at).toBeNull();
  });

  test('hay un aseo de gestión externa, inerte por CHECK y no por convención', async () => {
    const inerte = await leerAseo(escenario.aseoExterno);

    // `cl_unmanaged_is_inert`. Si alguna de estas cinco dejara de ser nula, el
    // aseo entraría en un total del que FIN-05 lo excluye expresamente.
    expect(inerte?.is_managed).toBe(false);
    expect(inerte?.state).toBeNull();
    expect(inerte?.aseador_id).toBeNull();
    expect(inerte?.tarifa_huesped).toBeNull();
    expect(inerte?.pago_aseador).toBeNull();

    expect(inerte!.scheduled_date >= escenario.periodo.desde).toBe(true);
    expect(inerte!.scheduled_date <= escenario.periodo.hasta).toBe(true);
  });

  test('hay una aseadora desactivada, y el trabajo que hizo antes de la baja SIGUE en el periodo', async () => {
    const { data: perfil, error } = await clienteAdminDePruebas()
      .from('profiles')
      .select('id, is_active, deactivated_at')
      .eq('id', escenario.aseadoraDeBaja)
      .single();

    expect(error).toBeNull();
    expect(perfil?.is_active).toBe(false);
    expect(perfil?.deactivated_at).not.toBeNull();

    // LA PARTE QUE IMPORTA. Darla de baja no borra lo que ya hizo, y el cierre
    // le tiene que seguir debiendo ese dinero. Un cálculo que filtre por
    // aseadora activa deja a una persona sin cobrar, y este es el escenario que
    // lo delata.
    const suyo = await leerAseo(escenario.aseoDeLaAseadoraDeBaja);
    expect(suyo?.aseador_id).toBe(escenario.aseadoraDeBaja);
    expect(suyo?.state).toBe('completada');
    expect(suyo!.scheduled_date >= escenario.periodo.desde).toBe(true);
    expect(suyo!.scheduled_date <= escenario.periodo.hasta).toBe(true);
  });
});

describe('el snapshot financiero del aseo', () => {
  test('cada aseo copió las tarifas de SU apartamento, y los dos apartamentos tienen tarifas distintas', async () => {
    // Que las dos tarifas sean distintas no es decoración: con una sola tarifa,
    // un total correcto se puede obtener multiplicando el número de aseos, y
    // entonces el test no distingue una suma de una multiplicación.
    expect(escenario.tarifas.aptoUno.tarifaHuesped).not.toBe(
      escenario.tarifas.aptoDos.tarifaHuesped,
    );
    expect(escenario.tarifas.aptoUno.pagoAseador).not.toBe(escenario.tarifas.aptoDos.pagoAseador);

    const delUno = await leerAseo(escenario.aseoConGasto);
    expect(delUno?.tarifa_huesped).toBe(escenario.tarifas.aptoUno.tarifaHuesped);
    expect(delUno?.pago_aseador).toBe(escenario.tarifas.aptoUno.pagoAseador);

    const delDos = await leerAseo(escenario.aseoConDano);
    expect(delDos?.tarifa_huesped).toBe(escenario.tarifas.aptoDos.tarifaHuesped);
    expect(delDos?.pago_aseador).toBe(escenario.tarifas.aptoDos.pagoAseador);

    // El snapshot copió la hora del apartamento (10:45) y no el default del
    // schema (11:30). Es la propiedad que hace útil a la fixture.
    expect(delUno?.hora_limite).toBe('10:45:00');
    expect(delUno?.is_managed).toBe(true);
  });

  test('todo aseo completado tiene sus dos marcas y el fin no es anterior al inicio', async () => {
    // `cl_completada_shape`. La base es INCAPAZ de guardar un aseo completado
    // sin fecha de fin, así que el cálculo del periodo no necesita relleno ni
    // valor de respaldo: puede leer `finished_at` y confiar.
    for (const id of [
      escenario.aseoAlFiloDelCierre,
      escenario.aseoDeLaMadrugadaSiguiente,
      escenario.aseoProgramadoEnOtroPeriodo,
      escenario.aseoConGasto,
      escenario.aseoConDano,
      escenario.aseoDeLaAseadoraDeBaja,
    ]) {
      const aseo = await leerAseo(id);
      expect(aseo?.state, `el aseo ${id} debería estar completado`).toBe('completada');
      expect(aseo?.started_at).not.toBeNull();
      expect(aseo?.finished_at).not.toBeNull();
      expect(Date.parse(aseo!.finished_at!) >= Date.parse(aseo!.started_at!)).toBe(true);
    }
  });
});

describe('limpiarAseos también borra el escenario financiero', () => {
  test('se lleva los aseos, los gastos, los daños, las fotos, los apartamentos y los perfiles', async () => {
    const admin = clienteAdminDePruebas();

    // CONTROL POSITIVO: sin esto, una limpieza que no borrara nada pasaría
    // todas las aserciones de ausencia de abajo con el escenario ya vacío.
    expect(await leerAseo(escenario.aseoConGasto)).not.toBeNull();

    await limpiarAseos();

    expect(await leerAseo(escenario.aseoAlFiloDelCierre)).toBeNull();
    expect(await leerAseo(escenario.aseoExterno)).toBeNull();

    // Las hijas caen por cascade desde el aseo. Se comprueban de todas formas:
    // un gasto huérfano bloquearía el borrado del apartamento con 23503 y
    // dejaría la base sucia para el archivo siguiente, que es exactamente como
    // se contamina una suite entera desde un solo test.
    const { data: gastos } = await admin
      .from('expenses')
      .select('id')
      .eq('id', escenario.gasto.id);
    expect(gastos).toEqual([]);

    const { data: danos } = await admin.from('damages').select('id').eq('id', escenario.dano);
    expect(danos).toEqual([]);

    const { data: fotos } = await admin
      .from('cleaning_photos')
      .select('id')
      .eq('id', escenario.gasto.fotoId);
    expect(fotos).toEqual([]);

    const { data: propiedades } = await admin
      .from('properties')
      .select('id')
      .in('id', [escenario.aptoUno, escenario.aptoDos, escenario.aptoExterno]);
    expect(propiedades).toEqual([]);

    // Los perfiles caen por cascade desde `auth.users`. Se comprueban aparte
    // porque `properties.responsable_id` es `on delete restrict`: si el orden de
    // borrado se invirtiera, el apartamento sí desaparecería y el perfil no.
    const { data: perfiles } = await admin
      .from('profiles')
      .select('id')
      .in('id', [escenario.aseadoraUno, escenario.aseadoraDos, escenario.aseadoraDeBaja]);
    expect(perfiles).toEqual([]);

    // IDEMPOTENCIA. La segunda llamada es la que va a ocurrir de verdad: en el
    // `afterAll` de cualquier suite que ya haya limpiado en el camino de error.
    await expect(limpiarAseos()).resolves.toBeUndefined();
  });
});
