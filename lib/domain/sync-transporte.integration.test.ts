import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import { clienteAdminDePruebas } from '@/lib/test/clientes';
import {
  aseosDe,
  cancelados,
  correrSync,
  limpiarSync,
  sembrarFeed,
  type ResultadoDeCorrida,
} from '@/lib/test/sync';

/**
 * CRITERIO 3 DEL ROADMAP: UN FEED DEGRADADO NO DESTRUYE NADA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO MIDE EL MODO DE FALLO MÁS CARO DEL PRODUCTO.
 *
 * No es que el sync deje de crear aseos: eso se ve en un día y se arregla. Es
 * que el sync CANCELE los que ya existían porque leyó mal. Un mes de trabajo
 * confirmado y asignado desaparece de la agenda sin que nadie lo pida, y el
 * síntoma —agenda vacía— tarda días en ser evidente.
 *
 * Las seis formas del feed degradado se miden una a una, y las seis tienen la
 * MISMA aserción de fondo: el contador de aseos cancelados no se movió.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ HAY CENTINELA Y CONTROL, Y SIN ELLOS ESTO NO VALE NADA ──────────
 *
 * `expect(cancelados).toBe(0)` sobre un apartamento sin aseos es `0 === 0`:
 * pasa igual si el contador está roto, si la tabla está vacía o si el pipeline
 * nunca corrió. Las dos defensas, que son las del plan 02-14:
 *
 *   1. CENTINELA. Antes de servir el cuerpo degradado se corre el feed REAL, y
 *      el apartamento queda con QUINCE aseos vivos. La igualdad es sobre quince,
 *      no sobre cero.
 *   2. CONTROL DEL CONTADOR. El último bloque del archivo demuestra que el
 *      contador SÍ se mueve cuando de verdad se cancela: una reserva futura que
 *      desaparece dos corridas seguidas cancela su aseo, y el número sube.
 */

const FIXTURES = resolve(process.cwd(), 'lib/domain/__fixtures__/ical');

function fixture(nombre: string): string {
  return readFileSync(resolve(FIXTURES, nombre), 'utf8');
}

const FEED_REAL = fixture('airbnb-real-anonimizado.ics');

function conDtstamp(cuerpo: string, valor: string): string {
  return cuerpo.replace(/DTSTAMP:[0-9TZ]+/g, `DTSTAMP:${valor}`);
}

/**
 * Quita el `VEVENT` cuyo fin es `dtend`. Se usa SOLO en el bloque de control,
 * para provocar una cancelación de verdad.
 */
function sinCheckout(cuerpo: string, dtend: string): string {
  const partes = cuerpo.split('BEGIN:VEVENT');
  const cabecera = partes[0];
  const bloques = partes.slice(1);
  const quedan = bloques.filter((b) => !b.includes(`DTEND;VALUE=DATE:${dtend}`));
  if (quedan.length !== bloques.length - 1) {
    throw new Error(`El feed no tiene exactamente un evento que termine el ${dtend}.`);
  }
  return cabecera + quedan.map((b) => `BEGIN:VEVENT${b}`).join('');
}

/**
 * Siembra un feed y lo deja con los QUINCE aseos del feed real.
 *
 * Es el centinela de todo el archivo: deja `last_event_count = 15`, que es el
 * operando de la guarda de colapso, y quince aseos vivos que un reconcile mal
 * hecho tendría que cancelar.
 */
async function conQuinceAseos(): Promise<{ propertyId: string; feedId: string; hash: string; exito: string }> {
  const { propertyId, feedId } = await sembrarFeed();
  const corrida = await correrSync(feedId, FEED_REAL);

  expect(corrida.cuerpo.outcome).toBe('ok');
  expect((await aseosDe(propertyId)).length).toBe(15);
  expect(corrida.feed.last_event_count).toBe(15);
  expect(corrida.feed.last_payload_hash).not.toBeNull();

  return {
    propertyId,
    feedId,
    hash: corrida.feed.last_payload_hash as string,
    exito: corrida.feed.last_success_at as string,
  };
}

/**
 * LA PRUEBA DE QUE EL RPC NO SE LLAMÓ.
 *
 * `last_payload_hash` y `last_success_at` los escribe `sync_feed_apply()`
 * DENTRO de su transacción y nadie más: `registrarFalloDeSync` ni siquiera los
 * nombra en su `update`. Si los dos siguen valiendo lo que valían antes de la
 * corrida degradada, esa corrida no llegó al RPC.
 */
function noLlamoAlRpc(corrida: ResultadoDeCorrida, hash: string, exito: string): void {
  expect(corrida.feed.last_payload_hash).toBe(hash);
  expect(corrida.feed.last_success_at).toBe(exito);
  expect(corrida.corrida?.outcome).not.toBe('ok');
}

afterAll(async () => {
  await limpiarSync();
});

// ════════════════════════════════════════════════════════════════════════════
// LOS BLOQUEOS DEL PROPIETARIO: SE CUENTAN Y NO GENERAN NADA
// ════════════════════════════════════════════════════════════════════════════

describe('un feed de puros bloqueos produce cero aseos', () => {
  test('10: noventa bloqueos de un día son noventa filas contadas y cero aseos', async () => {
    const { propertyId, feedId } = await sembrarFeed();

    const corrida = await correrSync(feedId, fixture('airbnb-bloqueos-1dia.ics'));

    expect(corrida.hits).toBe(1);
    expect(corrida.cuerpo.outcome).toBe('ok');
    expect(corrida.corrida?.event_count).toBe(90);
    expect(corrida.corrida?.block_count).toBe(90);
    expect(corrida.corrida?.reservation_count).toBe(0);

    // LA MAGNITUD DE LO QUE LA FALLA CERRADA EVITA: si el clasificador tratara
    // un bloqueo como reserva, esto no serían 90 filas de más, serían 90 aseos
    // fantasma en un apartamento, con 90 notificaciones y 90 pagos.
    expect((await aseosDe(propertyId)).length).toBe(0);
  });

  test('11: la fixture sintética de la Fase 2 también produce cero aseos', async () => {
    const { propertyId, feedId } = await sembrarFeed();

    const corrida = await correrSync(feedId, fixture('solo-bloqueos.ics'));

    expect(corrida.cuerpo.outcome).toBe('ok');
    expect(corrida.corrida?.block_count).toBe(3);
    expect((await aseosDe(propertyId)).length).toBe(0);
  });

  test('12: un SUMMARY desconocido da cero aseos, tres desconocidos y UNA alerta', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    const admin = clienteAdminDePruebas();

    const corrida = await correrSync(feedId, fixture('airbnb-summary-desconocido.ics'));

    expect(corrida.cuerpo.outcome).toBe('ok');
    expect(corrida.corrida?.event_count).toBe(3);
    expect(corrida.corrida?.unknown_count).toBe(3);
    expect(corrida.corrida?.reservation_count).toBe(0);
    expect((await aseosDe(propertyId)).length).toBe(0);

    // Las dos mitades son la MISMA aserción: cero aseos Y una alerta. Fallar
    // cerrado sin avisar apaga la sincronización en silencio.
    const { data: alertas, error } = await admin
      .from('notifications')
      .select('dedupe_key, type, payload')
      .eq('property_id', propertyId);

    expect(error).toBeNull();
    expect(alertas?.length).toBeGreaterThan(0);
    // Una sola alerta lógica: el fan-out es por admin activo, así que la unidad
    // que se cuenta es la clave de deduplicación, no la fila.
    expect(new Set((alertas ?? []).map((a) => a.dedupe_key)).size).toBe(1);
    for (const alerta of alertas ?? []) {
      expect(alerta.type).toBe('calendario_caido');
      expect((alerta.payload as Record<string, unknown>).motivo).toBe('formato_desconocido');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LAS CUATRO LECTURAS QUE NO PUEDEN LLEGAR AL RPC
// ════════════════════════════════════════════════════════════════════════════

describe('un feed degradado no llega al RPC y no cancela nada', () => {
  test('13: un calendario vacío con quince reservas anteriores es colapso, no ausencia', async () => {
    const { propertyId, feedId, hash, exito } = await conQuinceAseos();

    const corrida = await correrSync(feedId, fixture('vacio.ics'));

    expect(corrida.hits).toBe(1);
    expect(corrida.cuerpo.outcome).toBe('colapso');
    expect(corrida.cuerpo.codigo).toBe('cero_reservas_clasificadas');
    noLlamoAlRpc(corrida, hash, exito);

    expect(corrida.corrida?.outcome).toBe('colapso');
    expect(corrida.corrida?.cleanings_cancelled).toBe(0);
    expect(await cancelados(propertyId)).toBe(0);
    expect((await aseosDe(propertyId)).length).toBe(15);
  });

  test('14: doscientos con cuerpo HTML es transporte, no un feed sin reservas', async () => {
    const { propertyId, feedId, hash, exito } = await conQuinceAseos();

    const corrida = await correrSync(feedId, fixture('html-200.html'), {
      contentType: 'text/html; charset=utf-8',
    });

    expect(corrida.hits).toBe(1);
    expect(corrida.cuerpo.outcome).toBe('transporte');
    expect(corrida.cuerpo.codigo).toBe('content_type_html');
    noLlamoAlRpc(corrida, hash, exito);

    expect(await cancelados(propertyId)).toBe(0);
    expect((await aseosDe(propertyId)).length).toBe(15);
  });

  test('15: un cuerpo truncado NO pasa, y es la única aserción que prueba esa guarda', async () => {
    const { propertyId, feedId, hash, exito } = await conQuinceAseos();

    // El sniff de cabecera de la Fase 2 lo deja pasar: el archivo SÍ empieza por
    // `BEGIN:VCALENDAR`. Lo único que lo para es la guarda de cuerpo incompleto.
    // Se sirve con el `Content-Type` correcto a propósito, para que ninguna de
    // las guardas anteriores lo atrape antes y la aserción siga siendo sobre
    // esta y no sobre otra.
    const truncado = fixture('airbnb-truncado.ics');
    expect(truncado.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(truncado.includes('END:VCALENDAR')).toBe(false);

    const corrida = await correrSync(feedId, truncado);

    expect(corrida.hits).toBe(1);
    expect(corrida.cuerpo.outcome).toBe('transporte');
    expect(corrida.cuerpo.codigo).toBe('cuerpo_truncado');
    noLlamoAlRpc(corrida, hash, exito);

    // Siete reservas se quedaron fuera del cuerpo. Tratarlo como lectura buena
    // sería convertir una respuesta parcial de red en siete desapariciones.
    expect(await cancelados(propertyId)).toBe(0);
    expect((await aseosDe(propertyId)).length).toBe(15);
  });

  test('16: LA ASERCIÓN CENTRAL — Airbnb cambia el formato y no se cancela ni un aseo', async () => {
    const { propertyId, feedId, hash, exito } = await conQuinceAseos();

    // Llegan LOS QUINCE EVENTOS. Una guarda por conteo de eventos no se movería
    // ni un poco: `event_count` sigue valiendo quince. Lo que cae a cero es
    // `reservation_count`, porque el discriminador positivo —la ruta de detalle
    // dentro de la descripción— dejó de casar.
    const mutilado = fixture('airbnb-desc-mutilado.ics');

    const primera = await correrSync(feedId, mutilado);

    expect(primera.cuerpo.outcome).toBe('colapso');
    expect(primera.cuerpo.codigo).toBe('cero_reservas_clasificadas');
    // La firma literal del desastre: quince eventos, cero reservas.
    expect(primera.corrida?.event_count).toBe(15);
    expect(primera.corrida?.reservation_count).toBe(0);
    expect(primera.corrida?.unknown_count).toBe(15);
    noLlamoAlRpc(primera, hash, exito);

    // SEGUNDA CORRIDA, y es la que importa: la cancelación exige DOS ausencias
    // consecutivas. Si la primera hubiera marcado ausencia, esta cancelaría los
    // quince. El cuerpo cambia en lo que el pipeline ignora para que el atajo
    // por hash no la corte y la guarda tenga que hacer su trabajo otra vez.
    const segunda = await correrSync(feedId, conDtstamp(mutilado, '20260903T030000Z'));

    expect(segunda.cuerpo.outcome).toBe('colapso');
    noLlamoAlRpc(segunda, hash, exito);

    expect(await cancelados(propertyId)).toBe(0);
    const aseos = await aseosDe(propertyId);
    expect(aseos.length).toBe(15);
    expect(aseos.every((a) => a.state === 'pendiente')).toBe(true);

    // Y las reservas siguen sin marca de ausencia: de una corrida en la que
    // nada clasificó no se aprende NADA sobre ausencias.
    const { data: reservas } = await clienteAdminDePruebas()
      .from('calendar_reservations')
      .select('disappeared_at')
      .eq('feed_id', feedId);

    expect(reservas?.length).toBe(15);
    expect((reservas ?? []).every((r) => r.disappeared_at === null)).toBe(true);
  });

  test('17: una redirección hacia otro host se bloquea', async () => {
    const { propertyId, feedId, hash, exito } = await conQuinceAseos();

    // La allowlist valida lo que el admin ESCRIBIÓ, no a dónde TERMINA la
    // petición. `redirect: 'manual'` es la segunda mitad, y sin ella un 302
    // hacia una dirección interna la evade entera.
    const corrida = await correrSync(feedId, '', {
      status: 302,
      location: 'http://169.254.169.254/latest/meta-data/',
    });

    expect(corrida.hits).toBe(1);
    expect(corrida.cuerpo.outcome).toBe('transporte');
    expect(corrida.cuerpo.codigo).toBe('redirect_bloqueado');
    expect(corrida.cuerpo.http_status).toBe(302);
    noLlamoAlRpc(corrida, hash, exito);

    expect(await cancelados(propertyId)).toBe(0);
    expect((await aseosDe(propertyId)).length).toBe(15);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL CONTROL DEL CONTADOR: SIN ESTO, TODO LO DE ARRIBA ES UNA TAUTOLOGÍA
// ════════════════════════════════════════════════════════════════════════════

describe('CONTROL: el contador de cancelados SÍ se mueve cuando de verdad se cancela', () => {
  test('18: una reserva futura que desaparece dos corridas seguidas cancela su aseo', async () => {
    const { propertyId, feedId } = await conQuinceAseos();

    // El 2026-11-16 está lejos de la ventana protegida (hoy y mañana), no
    // participa del turnover y está por encima del piso del feed. Es decir:
    // los cuatro candados del reconcile lo dejan pasar, que es exactamente lo
    // que este control necesita demostrar.
    const DIA = '2026-11-16';
    const catorce = sinCheckout(FEED_REAL, '20261116');

    const primera = await correrSync(feedId, catorce);
    expect(primera.cuerpo.outcome).toBe('ok');
    expect(primera.corrida?.reservation_count).toBe(14);
    // PRIMERA ausencia: se marca, no se cancela. Es el candado 2.
    expect(primera.corrida?.cleanings_cancelled).toBe(0);
    expect(await cancelados(propertyId)).toBe(0);

    const segunda = await correrSync(feedId, conDtstamp(catorce, '20260903T040000Z'));
    expect(segunda.cuerpo.outcome).toBe('ok');

    // AQUÍ SE MUEVE EL CONTADOR. Si esta línea fuera cero, todas las de arriba
    // estarían pasando por vacuidad.
    expect(segunda.corrida?.cleanings_cancelled).toBe(1);
    expect(await cancelados(propertyId)).toBe(1);

    const aseos = await aseosDe(propertyId);
    const cancelado = aseos.filter((a) => a.state === 'cancelada');
    expect(cancelado.length).toBe(1);
    expect(cancelado[0].scheduled_date).toBe(DIA);
    expect(cancelado[0].cancel_reason).toBe('reserva_desaparecida');

    // Y los otros catorce siguen vivos: la cancelación es quirúrgica.
    expect(aseos.filter((a) => a.state === 'pendiente').length).toBe(14);
  });
});
