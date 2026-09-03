import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import type { Database } from '@/lib/database.types';
import { clienteAdminDePruebas } from '@/lib/test/clientes';
import {
  aseosDe,
  aseosVivosDe,
  cabecerasDe,
  cancelados,
  correrDiff,
  correrSync,
  limpiarSync,
  notificacionesDe,
  reservasDe,
  sembrarFeed,
  sinCheckout,
  sqlDePruebas,
  transicionesDe,
} from '@/lib/test/sync';

import { diaRelativo, feedConCheckoutRelativo } from './__fixtures__/ical/generar';

/**
 * CRITERIO 4 DEL ROADMAP: EL DIFF DESTRUCTIVO, CON SUS CUATRO CANDADOS.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TODO LO QUE ESTE ARCHIVO MIDE SOLO EXISTE ENTRE CORRIDAS.
 *
 * La regla de las dos ausencias, el `304` que no cuenta como observación y el
 * aseo nuevo que nace huérfano cuando el viejo sobrevive no son propiedades de
 * una llamada: son propiedades de una SECUENCIA. Ninguna prueba de una sola
 * pasada las ve, y por eso cada spec de aquí encadena dos, tres o cuatro
 * corridas contra el mismo feed sembrado.
 *
 * Es también el archivo donde un error BORRA TRABAJO REAL. Un aseo cancelado
 * por equivocación a las 6am deja a una aseadora en la calle, y el síntoma
 * —agenda vacía— tarda días en ser evidente.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LAS FECHAS RELATIVAS NO SON UN LUJO ────────────────────────────────────
 *
 * La ventana protegida se define respecto a HOY. Una fixture con fechas
 * literales que hoy cae dentro de la ventana mañana cae fuera, y el test que la
 * usa deja de probar lo que decía probar SIN QUE NADA SE PONGA ROJO. Por eso
 * los tres candados de fecha (aserciones 9, 10 y 11) se miden con
 * `feedConCheckoutRelativo`, y el día de referencia sale de `public.today_bog()`
 * leído de la base, que es quien decide la ventana.
 *
 * Requiere `npx supabase start` y `.env.local` con `CRON_SHARED_SECRET`.
 */

const FIXTURES = resolve(process.cwd(), 'lib/domain/__fixtures__/ical');

function fixture(nombre: string): string {
  return readFileSync(resolve(FIXTURES, nombre), 'utf8');
}

const FEED_REAL = fixture('airbnb-real-anonimizado.ics');
/** La reserva 5 (`HMWB84STVF`) mueve su `DTEND` del 2026-09-27 al 2026-09-29. */
const MOVIDA = fixture('airbnb-real-movida.ics');
/** Se va el primer `VEVENT`, el que termina el día de la captura. */
const UNA_MENOS = fixture('airbnb-real-una-menos.ics');
/** Los 15 `UID` cambian; los 15 códigos de reserva se conservan. */
const UID_ROTADO = fixture('airbnb-real-uid-rotado.ics');

/** Las dos fechas del caso "la reserva se movió". Del README de fixtures. */
const FECHA_VIEJA = '2026-09-27';
const FECHA_NUEVA = '2026-09-29';

/**
 * Un checkout futuro, lejos de la ventana protegida y por encima del piso del
 * feed real (`2026-09-02`). Es decir: los cuatro candados lo dejan pasar, que
 * es justo lo que hace falta para medir una cancelación DE VERDAD.
 */
const CHECKOUT_FUTURO = '2026-11-16';
const CHECKOUT_FUTURO_CRUDO = '20261116';
/** El segundo checkout futuro, para el control de la aserción 8. */
const OTRO_FUTURO = '2026-11-09';
const OTRO_FUTURO_CRUDO = '20261109';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const MARIA = '00000000-0000-4000-8000-000000000002';

/** El día de negocio según la base, que es quien decide la ventana protegida. */
function hoyBogota(): string {
  return sqlDePruebas('select public.today_bog();')[0];
}

/**
 * Rebautiza la reserva que termina en `dtend`: código de reserva Y `uid`
 * nuevos, mismas fechas.
 *
 * Es la entrada de la aserción 13. Para el diff es una reserva NUEVA —falla el
 * nivel 1 de identidad (código) y el nivel 2 (`uid`)— aunque ocupe exactamente
 * el mismo hueco del calendario, que es lo que Airbnb produce cuando una
 * reserva se cancela y se rehace.
 *
 * El código nuevo mide 10 caracteres como el viejo y el `uid` conserva su
 * longitud: así el plegado a 75 octetos de la `DESCRIPTION` sigue cayendo
 * exactamente donde caía y la fixture no deja de ser el feed real en todo lo
 * demás.
 */
function conReservaRebautizada(cuerpo: string, dtend: string): string {
  const partes = cuerpo.split('BEGIN:VEVENT');
  const cabecera = partes[0];
  const bloques = partes.slice(1);
  let tocados = 0;

  const nuevos = bloques.map((bloque) => {
    if (!bloque.includes(`DTEND;VALUE=DATE:${dtend}`)) return bloque;
    tocados += 1;
    return bloque
      .replace(/UID:[^\r\n]+/, 'UID:a1b2c3d4e5f6-ffffffffffffffffffffffffffffffff@airbnb.com')
      .replace(/tails\/[A-Z0-9]+/, 'tails/HMNUEVO001');
  });

  if (tocados !== 1) {
    throw new Error(`El feed no tiene exactamente un evento que termine el ${dtend}.`);
  }
  return cabecera + nuevos.map((b) => `BEGIN:VEVENT${b}`).join('');
}

/** El aseo de una fecha concreta del apartamento, cancelado o no. */
async function aseoDe(propertyId: string, fecha: string) {
  const encontrados = (await aseosDe(propertyId)).filter((a) => a.scheduled_date === fecha);
  if (encontrados.length !== 1) {
    throw new Error(`Se esperaba UN aseo el ${fecha}, hay ${encontrados.length}.`);
  }
  return encontrados[0];
}

/**
 * Deja el aseo confirmado por el admin y asignado, SIN empezar.
 *
 * Es el estado normal de un aseo de mañana: el admin ya puso huéspedes e
 * instrucciones y ya hay aseadora. Todavía se puede cancelar, porque el trabajo
 * no ha empezado.
 */
async function confirmar(cleaningId: string): Promise<void> {
  const { error } = await clienteAdminDePruebas()
    .from('cleanings')
    .update({
      confirmado_at: '2026-09-02T15:00:00.000Z',
      confirmado_by: ADMIN,
      aseador_id: MARIA,
      num_huespedes: 3,
    })
    .eq('id', cleaningId);
  if (error) throw new Error(`No se pudo confirmar el aseo: ${error.message}`);
}

/**
 * Deja el aseo EN CURSO: confirmado, asignado y con la aseadora ya dentro.
 *
 * NO EXISTE "pendiente con `started_at`", y conviene saberlo antes de leer las
 * aserciones 2 y 3: `cl_pendiente_shape` (migración 04) exige
 * `started_at is null` cuando el estado es `pendiente`, así que el único estado
 * en el que un aseo tiene trabajo dentro es `en_curso`. Y `cl_en_curso_shape`
 * exige además `confirmado_at` y `aseador_id` no nulos, que es exactamente el
 * escenario real: nadie empieza un aseo que el admin no confirmó.
 */
async function empezar(cleaningId: string): Promise<void> {
  await confirmar(cleaningId);
  const { error } = await clienteAdminDePruebas()
    .from('cleanings')
    .update({ state: 'en_curso', started_at: '2026-09-02T16:00:00.000Z' })
    .eq('id', cleaningId);
  if (error) throw new Error(`No se pudo empezar el aseo: ${error.message}`);
}

/** Siembra y deja el apartamento con los quince aseos del feed real. */
async function conQuinceAseos(): Promise<{ propertyId: string; feedId: string }> {
  const { propertyId, feedId } = await sembrarFeed();
  const corrida = await correrDiff(feedId, FEED_REAL);
  expect(corrida.cuerpo.outcome).toBe('ok');
  expect((await aseosDe(propertyId)).length).toBe(15);
  return { propertyId, feedId };
}

afterAll(async () => {
  await limpiarSync();
});

// ════════════════════════════════════════════════════════════════════════════
// LA RESERVA SE MOVIÓ (SYNC-04 y SYNC-05)
// ════════════════════════════════════════════════════════════════════════════

describe('una reserva que cambia de fechas', () => {
  test('1: el aseo viejo se cancela y el nuevo nace SIN CONFIRMAR', async () => {
    const { propertyId, feedId } = await conQuinceAseos();

    const t1 = await correrDiff(feedId, MOVIDA);
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.corrida?.cleanings_cancelled).toBe(1);

    const viejo = await aseoDe(propertyId, FECHA_VIEJA);
    expect(viejo.state).toBe('cancelada');
    expect(viejo.cancel_reason).toBe('reserva_movida');
    expect(viejo.cancelled_at).not.toBeNull();

    const nuevo = await aseoDe(propertyId, FECHA_NUEVA);
    expect(nuevo.state).toBe('pendiente');
    expect(nuevo.origin).toBe('ical');
    // SYNC-05 ES LITERALMENTE ESTO. La fecha cambió, así que lo que el admin
    // confirmó ya no es lo que va a pasar: el aseo nuevo vuelve a la bandeja.
    expect(nuevo.confirmado_at).toBeNull();
    expect(nuevo.aseador_id).toBeNull();
    expect(nuevo.num_huespedes).toBeNull();
    // El viejo SÍ se pudo cancelar, así que el nuevo hereda la reserva.
    expect(nuevo.reservation_id).toBe(viejo.reservation_id);

    // Quince vivos: catorce intactos más el reprogramado.
    expect((await aseosVivosDe(propertyId)).length).toBe(15);
    expect(await cancelados(propertyId)).toBe(1);
  });

  test('2: con la aseadora ya dentro NO se cancela, y el aseo nuevo nace HUÉRFANO', async () => {
    const { propertyId, feedId } = await conQuinceAseos();

    const viejoAntes = await aseoDe(propertyId, FECHA_VIEJA);
    await empezar(viejoAntes.id);

    const t1 = await correrDiff(feedId, MOVIDA);
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.corrida?.cleanings_cancelled).toBe(0);

    const viejo = await aseoDe(propertyId, FECHA_VIEJA);
    expect(viejo.state).toBe('en_curso');
    expect(viejo.cancelled_at).toBeNull();
    expect(viejo.cancel_reason).toBeNull();
    expect(viejo.started_at).not.toBeNull();
    // No se pierde en silencio: lo que no se pudo cancelar queda marcado.
    expect(viejo.needs_review).toBe(true);
    expect(viejo.review_reason).toBe('reserva_movida_aseo_iniciado');

    // ══════════════════════════════════════════════════════════════════════
    // LA TRAMPA MEDIDA, Y ES POR ESTO QUE ESTA ASERCIÓN EXISTE.
    //
    // `cleanings_one_live_per_reservation` es único sobre `reservation_id`
    // para las filas vivas. Si el aseo nuevo naciera apuntando a la MISMA
    // reserva que el viejo —que sigue vivo—, el insert reventaría con 23505 y
    // se llevaría por delante la corrida entera de las quince reservas.
    //
    // Nace huérfano y marcado para que un humano decida, que es la única de
    // las dos salidas aceptables: desapuntar el viejo borraría el vínculo que
    // un pago o una disputa necesitan sobre un aseo que ya tiene trabajo
    // dentro.
    // ══════════════════════════════════════════════════════════════════════
    const nuevo = await aseoDe(propertyId, FECHA_NUEVA);
    expect(nuevo.reservation_id).toBeNull();
    expect(nuevo.state).toBe('pendiente');
    expect(nuevo.confirmado_at).toBeNull();

    // Dieciséis vivos: los quince de siempre más el de la fecha nueva. El
    // sistema se queda con un aseo DE MÁS y una alerta, que es el lado
    // correcto en el que equivocarse.
    expect((await aseosVivosDe(propertyId)).length).toBe(16);
    expect(await cancelados(propertyId)).toBe(0);

    // Y la alerta existe. Una sola, por clave de deduplicación.
    const alertas = (await notificacionesDe(propertyId)).filter(
      (n) => n.dedupe_key === `rev:${viejo.id}`,
    );
    expect(alertas.length).toBeGreaterThan(0);
    expect(
      (alertas[0].payload as Record<string, unknown>).motivo,
    ).toBe('reserva_movida_no_cancelable');
  });

  test('3: confirmado y asignado pero SIN empezar sí se cancela', async () => {
    const { propertyId, feedId } = await conQuinceAseos();

    const viejoAntes = await aseoDe(propertyId, FECHA_VIEJA);
    await confirmar(viejoAntes.id);

    const t1 = await correrDiff(feedId, MOVIDA);
    expect(t1.corrida?.cleanings_cancelled).toBe(1);

    const viejo = await aseoDe(propertyId, FECHA_VIEJA);
    expect(viejo.state).toBe('cancelada');
    expect(viejo.cancel_reason).toBe('reserva_movida');
    // La confirmación del admin sigue ahí: se cancela el aseo, no se borra su
    // historia.
    expect(viejo.confirmado_at).not.toBeNull();
    expect(viejo.aseador_id).toBe(MARIA);

    // El trabajo aún no había empezado, así que la reprogramación es limpia.
    const nuevo = await aseoDe(propertyId, FECHA_NUEVA);
    expect(nuevo.confirmado_at).toBeNull();
    expect(nuevo.aseador_id).toBeNull();
    expect(nuevo.reservation_id).toBe(viejo.reservation_id);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA RESERVA DESAPARECIÓ (SYNC-04) — LA REGLA DE LAS DOS AUSENCIAS
// ════════════════════════════════════════════════════════════════════════════

describe('una reserva que desaparece del feed', () => {
  test('4, 5 y 6: la primera ausencia solo marca, la segunda cancela, y el contador se mueve', async () => {
    const { propertyId, feedId } = await conQuinceAseos();
    const catorce = sinCheckout(FEED_REAL, CHECKOUT_FUTURO_CRUDO);

    // ── PRIMERA AUSENCIA ──────────────────────────────────────────────────
    const t1 = await correrDiff(feedId, catorce);
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.corrida?.reservation_count).toBe(14);

    const ausente = (await reservasDe(propertyId)).find((r) => r.ends_on === CHECKOUT_FUTURO);
    expect(ausente?.disappeared_at).not.toBeNull();

    // MARCAR NO ES CANCELAR. A 30 minutos de cadencia, exigir una segunda
    // observación cuesta como mucho una hora de retraso y elimina de raíz toda
    // la clase de "una lectura mala canceló los aseos".
    expect(t1.corrida?.cleanings_cancelled).toBe(0);
    expect(await cancelados(propertyId)).toBe(0);
    expect((await aseoDe(propertyId, CHECKOUT_FUTURO)).state).toBe('pendiente');

    // ── SEGUNDA AUSENCIA ──────────────────────────────────────────────────
    const t2 = await correrDiff(feedId, catorce);

    // ══════════════════════════════════════════════════════════════════════
    // ASERCIÓN 6, EL CONTROL. SIN ESTA LÍNEA, TODAS LAS DE "NO CANCELÓ NADA"
    // DE ESTE ARCHIVO Y DEL DE TRANSPORTE PASAN POR VACUIDAD: un contador roto
    // que devolviera siempre cero las pondría todas en verde.
    // ══════════════════════════════════════════════════════════════════════
    expect(t2.corrida?.cleanings_cancelled).toBe(1);
    expect(await cancelados(propertyId)).toBe(1);

    const cancelado = await aseoDe(propertyId, CHECKOUT_FUTURO);
    expect(cancelado.state).toBe('cancelada');
    expect(cancelado.cancel_reason).toBe('reserva_desaparecida');
    // Quirúrgica: los otros catorce siguen vivos.
    expect((await aseosVivosDe(propertyId)).length).toBe(14);
  });

  test('7: UN 304 NO ES UNA CORRIDA DE DIFF, y la cancelación se retrasa hasta la cuarta', async () => {
    const { propertyId, feedId } = await conQuinceAseos();
    const catorce = sinCheckout(FEED_REAL, CHECKOUT_FUTURO_CRUDO);

    // t1: primera ausencia. El etag queda guardado en el feed.
    const t1 = await correrDiff(feedId, catorce, { etag: 'W/"v1"' });
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.feed.last_etag).toBe('W/"v1"');
    expect(await cancelados(propertyId)).toBe(0);

    const antes = (await reservasDe(propertyId)).find((r) => r.ends_on === CHECKOUT_FUTURO);
    expect(antes?.disappeared_at).not.toBeNull();

    // t2: EL PROVEEDOR DICE "no cambié". No es "no vi la reserva".
    const t2 = await correrSync(feedId, '', { status: 304, etag: 'W/"v1"' });
    expect(t2.cuerpo.outcome).toBe('no_modificado');
    expect(t2.corrida?.outcome).toBe('no_modificado');

    // CONTROL DEL CONTROL: el 304 salió de un condicional REAL, con el etag
    // que guardó t1. Sin esto, el arnés le estaría regalando el 304 al worker
    // y esta prueba se comprobaría a sí misma.
    expect(cabecerasDe(feedId)['if-none-match']).toBe('W/"v1"');

    // ══════════════════════════════════════════════════════════════════════
    // AQUÍ ESTÁ EL CRITERIO. Contar el 304 como ausencia cancelaría aseos
    // EXACTAMENTE CUANDO EL PROVEEDOR ESTÁ MÁS ESTABLE, que es el peor momento
    // posible para equivocarse: Airbnb reemite el mismo cuerpo cada ~3 horas.
    // ══════════════════════════════════════════════════════════════════════
    expect(await cancelados(propertyId)).toBe(0);
    expect((await aseoDe(propertyId, CHECKOUT_FUTURO)).state).toBe('pendiente');

    // Y no tocó la marca de ausencia: no la refrescó ni la borró.
    const despues = (await reservasDe(propertyId)).find((r) => r.ends_on === CHECKOUT_FUTURO);
    expect(despues?.disappeared_at).toBe(antes?.disappeared_at);

    // t3: la SEGUNDA corrida de diff de verdad. Ahora sí.
    const t3 = await correrDiff(feedId, catorce);
    expect(t3.corrida?.cleanings_cancelled).toBe(1);
    expect((await aseoDe(propertyId, CHECKOUT_FUTURO)).cancel_reason).toBe('reserva_desaparecida');
  });

  test('8: un aseo manual es intocable, y el ical de al lado sí se cancela', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    const admin = clienteAdminDePruebas();

    // El repaso lo puso el admin en una fecha que además es checkout. El sync
    // no lo pisa al crear (`on conflict do nothing`) ni al cancelar.
    const { data: manual, error } = await admin
      .from('cleanings')
      .insert({
        property_id: propertyId,
        origin: 'manual',
        tipo: 'repaso',
        scheduled_date: CHECKOUT_FUTURO,
        num_huespedes: 2,
        instrucciones: 'Repaso pedido por el propietario. No lo toca el sync.',
        aseador_id: MARIA,
        confirmado_at: '2026-09-01T15:00:00.000Z',
        confirmado_by: ADMIN,
        // `hora_limite` e `is_managed` son NOT NULL en el tipo generado y las
        // rellena `tg_cleanings_snapshot()` en el BEFORE: los CHECK de tabla se
        // evalúan DESPUÉS de los triggers, así que el insert es válido aunque
        // el tipo no lo sepa. Mismo casteo que el plan 03-08.
      } as Database['public']['Tables']['cleanings']['Insert'])
      .select('id')
      .single();

    expect(error).toBeNull();
    await correrDiff(feedId, FEED_REAL);
    expect((await aseosDe(propertyId)).length).toBe(15);

    // Desaparecen DOS checkouts: el que ocupa el manual y uno vecino que sí
    // tiene aseo de sync. El vecino es el control.
    const trece = sinCheckout(sinCheckout(FEED_REAL, CHECKOUT_FUTURO_CRUDO), OTRO_FUTURO_CRUDO);

    await correrDiff(feedId, trece);
    await correrDiff(feedId, trece);

    const repaso = await aseoDe(propertyId, CHECKOUT_FUTURO);
    expect(repaso.id).toBe(manual?.id);
    expect(repaso.origin).toBe('manual');
    expect(repaso.tipo).toBe('repaso');
    expect(repaso.state).toBe('pendiente');
    expect(repaso.aseador_id).toBe(MARIA);
    expect(repaso.cancelled_at).toBeNull();
    expect(repaso.cancel_reason).toBeNull();
    expect(repaso.needs_review).toBe(false);

    // CONTROL: el aseo de sync de al lado, con la misma historia de dos
    // ausencias, SÍ se canceló. La diferencia es una sola línea de `where`:
    // `origin = 'ical'`.
    const vecino = await aseoDe(propertyId, OTRO_FUTURO);
    expect(vecino.state).toBe('cancelada');
    expect(vecino.cancel_reason).toBe('reserva_desaparecida');
  });

  test('4bis: la reserva que termina HOY desaparece dos veces y NO se cancela', async () => {
    // Es la fixture derivada del feed real: el `VEVENT` que se va es el que
    // termina el día de la captura. Es el caso peligroso de verdad, y el que
    // demuestra que "dos ausencias" no basta por sí solo.
    const { propertyId, feedId } = await conQuinceAseos();

    await correrDiff(feedId, UNA_MENOS);
    const t2 = await correrDiff(feedId, UNA_MENOS);

    expect(t2.corrida?.reservation_count).toBe(14);
    expect(t2.corrida?.cleanings_cancelled).toBe(0);
    expect(await cancelados(propertyId)).toBe(0);

    const deHoy = await aseoDe(propertyId, '2026-09-02');
    expect(deHoy.state).toBe('pendiente');
    expect(deHoy.needs_review).toBe(true);
    expect(deHoy.review_reason).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LOS CANDADOS DE FECHA, CON FIXTURES RELATIVAS A HOY
// ════════════════════════════════════════════════════════════════════════════

describe('la ventana protegida y el piso del feed', () => {
  /**
   * Base de los tres specs: cuatro checkouts en `hoy`, `hoy+1`, `hoy+2` y
   * `hoy+20`. Una noche por estadía para que los rangos no se solapen más de
   * lo necesario.
   */
  const OFFSETS = [0, 1, 2, 20];

  async function conCuatroAseos(hoy: string) {
    const base = feedConCheckoutRelativo(OFFSETS, hoy, { noches: 1 });
    const { propertyId, feedId } = await sembrarFeed();
    const t0 = await correrDiff(feedId, base);
    expect(t0.cuerpo.outcome).toBe('ok');
    expect(t0.corrida?.reservation_count).toBe(4);
    expect((await aseosDe(propertyId)).length).toBe(4);
    return { propertyId, feedId, base };
  }

  test('9: el aseo de HOY y el de MAÑANA sobreviven a dos ausencias', async () => {
    const hoy = hoyBogota();

    for (const protegido of [0, 1]) {
      const { propertyId, feedId, base } = await conCuatroAseos(hoy);
      const dia = diaRelativo(hoy, protegido);
      const sinEl = sinCheckout(base, dia.crudo);

      await correrDiff(feedId, sinEl);
      const t2 = await correrDiff(feedId, sinEl);

      // ════════════════════════════════════════════════════════════════════
      // ESTE ES EL ESCENARIO DE LA ASEADORA EN CAMINO AL APARTAMENTO.
      // Sin la ventana protegida, el aseo de HOY aparece cancelado y nadie va.
      // ════════════════════════════════════════════════════════════════════
      expect(t2.corrida?.cleanings_cancelled).toBe(0);
      expect(await cancelados(propertyId)).toBe(0);

      const aseo = await aseoDe(propertyId, dia.iso);
      expect(aseo.state).toBe('pendiente');
      expect(aseo.cancelled_at).toBeNull();
      // No se pierde en silencio.
      expect(aseo.needs_review).toBe(true);
      expect(aseo.review_reason).toBe('reserva_desaparecida_ventana_protegida');
    }
  });

  test('10: CONTROL de la ventana — el de pasado mañana SÍ se cancela', async () => {
    const hoy = hoyBogota();
    const { propertyId, feedId, base } = await conCuatroAseos(hoy);
    const dia = diaRelativo(hoy, 2);
    const sinEl = sinCheckout(base, dia.crudo);

    // El piso de esta corrida es `hoy` (el checkout de hoy sigue en el feed),
    // así que el candado 4 no participa y lo único que decide es la ventana.
    await correrDiff(feedId, sinEl);
    const t2 = await correrDiff(feedId, sinEl);

    expect(t2.corrida?.cleanings_cancelled).toBe(1);
    const aseo = await aseoDe(propertyId, dia.iso);
    expect(aseo.state).toBe('cancelada');
    expect(aseo.cancel_reason).toBe('reserva_desaparecida');

    // Y los dos protegidos siguen vivos en la MISMA corrida. Es lo que
    // demuestra que la ventana es una ventana y no un "nunca cancela".
    expect((await aseoDe(propertyId, diaRelativo(hoy, 0).iso)).state).toBe('pendiente');
    expect((await aseoDe(propertyId, diaRelativo(hoy, 1).iso)).state).toBe('pendiente');
  });

  test('11: el piso del feed salva lo que quedó por debajo, y su control lo cancela', async () => {
    const hoy = hoyBogota();
    const base = feedConCheckoutRelativo([5, 10, 30], hoy, { noches: 1 });

    // ── EL CANDADO ────────────────────────────────────────────────────────
    // La ventana de observación del proveedor salta hacia adelante: se van los
    // checkouts de hoy+5 y hoy+10, y el piso de la corrida pasa a ser hoy+30.
    // Lo que quedó por detrás NO está cancelado: está FUERA DE LA VENTANA.
    const conPiso = await sembrarFeed();
    await correrDiff(conPiso.feedId, base);
    expect((await aseosDe(conPiso.propertyId)).length).toBe(3);

    const soloLejano = sinCheckout(
      sinCheckout(base, diaRelativo(hoy, 5).crudo),
      diaRelativo(hoy, 10).crudo,
    );

    await correrDiff(conPiso.feedId, soloLejano);
    const t2 = await correrDiff(conPiso.feedId, soloLejano);

    expect(t2.corrida?.min_ends_on).toBe(diaRelativo(hoy, 30).iso);
    expect(t2.corrida?.cleanings_cancelled).toBe(0);
    expect(await cancelados(conPiso.propertyId)).toBe(0);

    for (const offset of [5, 10]) {
      const aseo = await aseoDe(conPiso.propertyId, diaRelativo(hoy, offset).iso);
      expect(aseo.state).toBe('pendiente');
      expect(aseo.needs_review).toBe(true);
      expect(aseo.review_reason).toBe('reserva_desaparecida_bajo_piso');
    }

    // ── EL CONTROL, Y SIN ÉL LO DE ARRIBA NO DICE NADA ────────────────────
    // Misma desaparición, mismo par de corridas, misma fecha lejos de la
    // ventana protegida. LA ÚNICA DIFERENCIA es que el piso de la corrida
    // queda por debajo del aseo, porque el checkout de hoy+5 sigue en el feed.
    const conControl = await sembrarFeed();
    await correrDiff(conControl.feedId, base);

    const sinElDeEnMedio = sinCheckout(base, diaRelativo(hoy, 10).crudo);
    await correrDiff(conControl.feedId, sinElDeEnMedio);
    const control = await correrDiff(conControl.feedId, sinElDeEnMedio);

    expect(control.corrida?.min_ends_on).toBe(diaRelativo(hoy, 5).iso);
    expect(control.corrida?.cleanings_cancelled).toBe(1);
    expect((await aseoDe(conControl.propertyId, diaRelativo(hoy, 10).iso)).state).toBe('cancelada');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA IDENTIDAD DE LA RESERVA Y LA IDENTIDAD DEL ASEO
// ════════════════════════════════════════════════════════════════════════════

describe('el trabajo humano sobrevive al ruido de la fuente', () => {
  test('12: los quince UID rotan, las reservas se actualizan y el contador lo dice', async () => {
    const { propertyId, feedId } = await conQuinceAseos();

    const confirmados = [FECHA_VIEJA, CHECKOUT_FUTURO];
    for (const fecha of confirmados) {
      await confirmar((await aseoDe(propertyId, fecha)).id);
    }

    const antes = await reservasDe(propertyId);
    const t1 = await correrDiff(feedId, UID_ROTADO);
    expect(t1.cuerpo.outcome).toBe('ok');

    // Se ACTUALIZAN, no se duplican: el nivel 1 de identidad (el código de
    // reserva) gana sobre el nivel 2 (el `uid`). La aserción es sobre las
    // FILAS y no sobre un contador: quince filas nuevas también serían quince,
    // así que lo que se compara es el conjunto de ids.
    expect(t1.corrida?.reservation_count).toBe(15);
    const despues = await reservasDe(propertyId);
    expect(despues.length).toBe(15);
    expect(despues.map((r) => r.id).sort()).toEqual(antes.map((r) => r.id).sort());
    // Y los `uid` sí cambiaron los quince: sin esto la aserción de arriba
    // pasaría igual con una fixture que no rotara nada.
    expect(
      despues.filter((r) => antes.some((a) => a.id === r.id && a.uid === r.uid)).length,
    ).toBe(0);

    // ══════════════════════════════════════════════════════════════════════
    // `uid_rotations` NO ES TELEMETRÍA DECORATIVA. Es el instrumento que
    // contesta EN PRODUCCIÓN si el identificador de evento de Airbnb sobrevive
    // a un cambio de fechas, pregunta que lleva dos documentos de research en
    // disputa y que ninguna fixture puede resolver.
    // ══════════════════════════════════════════════════════════════════════
    expect(t1.corrida?.uid_rotations).toBe(15);

    expect(t1.corrida?.cleanings_cancelled).toBe(0);
    expect((await aseosVivosDe(propertyId)).length).toBe(15);
    for (const fecha of confirmados) {
      const aseo = await aseoDe(propertyId, fecha);
      expect(aseo.confirmado_at).not.toBeNull();
      expect(aseo.aseador_id).toBe(MARIA);
      expect(aseo.num_huespedes).toBe(3);
    }
  });

  test('13: código y uid nuevos para las mismas fechas producen EL MISMO aseo', async () => {
    const { propertyId, feedId } = await conQuinceAseos();

    const antes = await aseoDe(propertyId, CHECKOUT_FUTURO);
    await confirmar(antes.id);

    const t1 = await correrDiff(feedId, conReservaRebautizada(FEED_REAL, CHECKOUT_FUTURO_CRUDO));
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.corrida?.cleanings_cancelled).toBe(0);

    // ══════════════════════════════════════════════════════════════════════
    // LA IDENTIDAD DEL ASEO ES (property_id, scheduled_date), NO LA RESERVA.
    // Airbnb cancela y rehace una reserva con código y uid nuevos para las
    // mismas fechas; el aseo NO se toca, solo se re-apunta su `reservation_id`.
    // La confirmación del admin, la aseadora, los huéspedes y las
    // instrucciones sobreviven.
    // ══════════════════════════════════════════════════════════════════════
    const despues = await aseoDe(propertyId, CHECKOUT_FUTURO);
    expect(despues.id).toBe(antes.id);
    expect(despues.confirmado_at).not.toBeNull();
    expect(despues.aseador_id).toBe(MARIA);
    expect(despues.num_huespedes).toBe(3);
    expect(despues.state).toBe('pendiente');

    // Y sí se re-apuntó: la reserva vieja quedó marcada ausente y el aseo
    // apunta a la nueva.
    expect(despues.reservation_id).not.toBe(antes.reservation_id);
    const reservas = await reservasDe(propertyId);
    expect(reservas.length).toBe(16);
    expect(reservas.find((r) => r.id === despues.reservation_id)?.disappeared_at).toBeNull();
    expect(reservas.find((r) => r.id === antes.reservation_id)?.disappeared_at).not.toBeNull();

    expect((await aseosVivosDe(propertyId)).length).toBe(15);
  });

  test('14: la bitácora registra la cancelación del sync con actor_id NULO', async () => {
    const { propertyId, feedId } = await conQuinceAseos();
    const catorce = sinCheckout(FEED_REAL, CHECKOUT_FUTURO_CRUDO);

    const objetivo = await aseoDe(propertyId, CHECKOUT_FUTURO);
    expect((await transicionesDe(objetivo.id)).length).toBe(0);

    await correrDiff(feedId, catorce);
    await correrDiff(feedId, catorce);

    const transiciones = await transicionesDe(objetivo.id);
    expect(transiciones.length).toBe(1);
    expect(transiciones[0].from_state).toBe('pendiente');
    expect(transiciones[0].to_state).toBe('cancelada');
    expect(transiciones[0].reason).toBe('reserva_desaparecida');

    // ══════════════════════════════════════════════════════════════════════
    // `actor_id` NULO ES INFORMACIÓN, NO UNA CARENCIA. Distingue "lo canceló
    // el sync" de "lo canceló el admin", que son dos hechos distintos y llevan
    // a dos conversaciones distintas con la aseadora que se quedó sin trabajo.
    // ══════════════════════════════════════════════════════════════════════
    expect(transiciones[0].actor_id).toBeNull();

    // CONTROL: los otros catorce aseos no tienen ninguna transición. La
    // bitácora registra lo que pasó, no todo lo que se miró.
    for (const aseo of await aseosVivosDe(propertyId)) {
      expect((await transicionesDe(aseo.id)).length).toBe(0);
    }
  });
});
