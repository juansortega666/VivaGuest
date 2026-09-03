import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import { clienteAdminDePruebas } from '@/lib/test/clientes';
import {
  alertasLogicas,
  aseosDe,
  aseosVivosDe,
  cancelados,
  conDtstamp,
  correrDiff,
  correrSync,
  limpiarSync,
  notificacionesDe,
  reservasDe,
  sembrarFeed,
  sqlDePruebas,
} from '@/lib/test/sync';

import { estadoDeSincronizacion } from './salud-sync';

/**
 * CRITERIO 5 DEL ROADMAP: LAS CINCO ALERTAS, CADA UNA DONDE DE VERDAD SE
 * COMPUTA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UNA ALERTA QUE SUENA SIEMPRE NO ES UNA ALERTA.
 *
 * Este archivo mide dos propiedades opuestas y las dos importan igual: que la
 * alerta APAREZCA cuando el hecho ocurre, y que NO aparezca cuando no ocurre.
 * La segunda es la que se olvida, y es la que decide si el admin sigue mirando
 * la bandeja dentro de un mes. Las dos aserciones que la sostienen:
 *
 *   · CERO notificaciones de "calendario caído" el día que muera el scheduler,
 *     y UNA que diga la verdad (aserción 4);
 *   · CERO notificaciones de "posible extensión" sobre el turnover del mismo
 *     día del feed real, que es el caso MÁS COMÚN del negocio (aserción 11).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL HUECO RESIDUAL, DECLARADO Y NO TAPADO ───────────────────────────────
 *
 * `feed_health_watchdog()` vive en `pg_cron`, así que si `pg_cron` deja de
 * correr el watchdog tampoco corre: NINGÚN VIGILANTE DENTRO DEL SCHEDULER PUEDE
 * VER LA MUERTE DEL SCHEDULER, y un segundo job que vigile al primero muere con
 * el primero. La capa que sí lo ve es `estadoDeSincronizacion` (aserción 5),
 * que se computa AL LEER en el panel de la Fase 4 y por eso se dispara aunque
 * no corra absolutamente nada dentro de la base. Su hueco: si el admin no abre
 * el panel, nadie se entera. Aceptable para un producto que el admin mira
 * varias veces al día, y lo cerraría un dead man's switch externo, que queda
 * diferido y fuera del MVP.
 *
 * ── POR QUÉ EL WATCHDOG SE MIDE POR SQL Y DENTRO DE UNA TRANSACCIÓN ─────────
 *
 * `feed_health_watchdog()` NO es alcanzable por PostgREST: la migración 14 le
 * revoca `execute` a `public` y solo se lo da a `postgres`, que es quien la
 * invoca desde `pg_cron`. Y sus conteos son GLOBALES —mira todos los feeds
 * activos de la base—, así que la única forma de fijar la población que ve es
 * desactivar el resto. Todo va dentro de un `begin … rollback`: la
 * desactivación, las marcas de tiempo y las notificaciones que emite se
 * deshacen enteras, y la base local, que es una sola y compartida entre
 * worktrees, queda exactamente como estaba.
 *
 * Requiere `npx supabase start` y `.env.local` con `CRON_SHARED_SECRET`.
 */

const FIXTURES = resolve(process.cwd(), 'lib/domain/__fixtures__/ical');

function fixture(nombre: string): string {
  return readFileSync(resolve(FIXTURES, nombre), 'utf8');
}

const FEED_REAL = fixture('airbnb-real-anonimizado.ics');
const EXTENSION = fixture('airbnb-extension-mal-creada.ics');

/** Turnover del mismo día: sale `HM6EM4A5K5` y entra `HMUBST2KCZ`. */
const DIA_DEL_TURNOVER = '2026-10-10';
/** El checkout de la reserva entrante del turnover. */
const SALIDA_DEL_ENTRANTE = '2026-10-12';
/** Fecha de unión de la extensión mal creada: `DTEND` nuevo de la acortada. */
const FECHA_DE_UNION = '2026-12-25';
/** El checkout que la extensión conserva. */
const CHECKOUT_DE_LA_EXTENSION = '2026-12-27';

function hoyBogota(): string {
  return sqlDePruebas('select public.today_bog();')[0];
}

/**
 * Mueve el `DTSTART` del `VEVENT` que termina en `dtend`, sin tocar su `DTEND`.
 *
 * Es la entrada de la aserción 8: la reserva ENTRANTE del turnover se corre un
 * día, así que ya no hay checkin el día del checkout y la urgencia tiene que
 * apagarse sola. `ends_on` no cambia, así que no hay nada que reconciliar: lo
 * único que se mide es el recálculo del paso (f).
 */
function conDtstart(cuerpo: string, dtend: string, nuevo: string): string {
  const partes = cuerpo.split('BEGIN:VEVENT');
  let tocados = 0;
  const bloques = partes.slice(1).map((bloque) => {
    if (!bloque.includes(`DTEND;VALUE=DATE:${dtend}`)) return bloque;
    tocados += 1;
    return bloque.replace(/DTSTART;VALUE=DATE:\d{8}/, `DTSTART;VALUE=DATE:${nuevo}`);
  });
  if (tocados !== 1) {
    throw new Error(`El feed no tiene exactamente un evento que termine el ${dtend}.`);
  }
  return partes[0] + bloques.map((b) => `BEGIN:VEVENT${b}`).join('');
}

/**
 * Corre un guion contra la base como `postgres`, dentro de `begin … rollback`,
 * y devuelve los pares `clave|valor` que el guion imprima.
 *
 * El `rollback` no es una cortesía: sin él, cada llamada al watchdog dejaría
 * notificaciones y marcas de `dead_alert_sent_at` en una base que comparten
 * todos los worktrees, y la prueba siguiente vería un mundo distinto del que
 * cree ver.
 */
function medirWatchdog(guion: string): Record<string, string> {
  const lineas = sqlDePruebas(`begin;\n${guion}\nrollback;`);
  const salida: Record<string, string> = {};
  for (const linea of lineas) {
    const corte = linea.indexOf('|');
    if (corte > 0) salida[linea.slice(0, corte)] = linea.slice(corte + 1);
  }
  return salida;
}

/**
 * El preámbulo obligatorio de todo guion de watchdog.
 *
 * 1. Vacía la bandeja: los conteos del watchdog son globales y las alertas de
 *    otros specs de este mismo archivo ya están en la tabla. Se deshace con el
 *    `rollback`.
 * 2. Deja activos SOLO los feeds del caso. Es lo que fija `v_activos`, que es
 *    el denominador del discriminador anti-tormenta.
 */
function soloEstosFeeds(feeds: string[]): string {
  const lista = feeds.map((f) => `'${f}'`).join(',');
  return `
delete from public.notifications;
update public.calendar_feeds set is_active = false where id <> all (array[${lista}]::uuid[]);
update public.calendar_feeds set is_active = true, dead_alert_sent_at = null
 where id = any (array[${lista}]::uuid[]);
`;
}

/** Conteos que casi todos los guiones necesitan, con `sufijo` para distinguirlos. */
function conteos(sufijo: string): string {
  return `
select 'feed_claves${sufijo}|' || count(distinct dedupe_key) from public.notifications where dedupe_key like 'feed_dead:%';
select 'feed_filas${sufijo}|'  || count(*)                   from public.notifications where dedupe_key like 'feed_dead:%';
select 'job_claves${sufijo}|'  || count(distinct dedupe_key) from public.notifications where dedupe_key like 'job_dead:%';
`;
}

afterAll(async () => {
  await limpiarSync();
});

// ════════════════════════════════════════════════════════════════════════════
// ALERTA 1: UN LINK DEJA DE RESPONDER (SYNC-09)
// ════════════════════════════════════════════════════════════════════════════

describe('un calendario que lleva horas sin sincronizar', () => {
  test('1, 2 y 3: una alerta por feed, ninguna repetida en 6 horas, y ninguna si está fresco', async () => {
    const a = await sembrarFeed();
    const b = await sembrarFeed();
    const c = await sembrarFeed();

    const medida = medirWatchdog(`
${soloEstosFeeds([a.feedId, b.feedId, c.feedId])}
update public.calendar_feeds set last_success_at = now() - interval '4 hours', last_error = null
 where id = '${a.feedId}';
update public.calendar_feeds set last_success_at = now() - interval '10 minutes', last_error = null
 where id in ('${b.feedId}','${c.feedId}');

select public.feed_health_watchdog();
${conteos('1')}
select 'scope1|'   || coalesce(max(payload->>'scope'), '<ninguno>')  from public.notifications where dedupe_key like 'feed_dead:%';
select 'motivo1|'  || coalesce(max(payload->>'motivo'), '<ninguno>') from public.notifications where dedupe_key like 'feed_dead:%';
select 'deA|'      || count(*) from public.notifications where dedupe_key like 'feed_dead:${a.feedId}:%';
select 'deB|'      || count(*) from public.notifications where dedupe_key like 'feed_dead:${b.feedId}:%';
select 'deC|'      || count(*) from public.notifications where dedupe_key like 'feed_dead:${c.feedId}:%';
select 'destinos|' || count(distinct recipient_id) from public.notifications where dedupe_key like 'feed_dead:%';
select 'admins|'   || count(*) from public.profiles where role = 'admin' and is_active;
select 'propiedad|'|| count(*) from public.notifications n
  where n.dedupe_key like 'feed_dead:%'
    and n.property_id = (select property_id from public.calendar_feeds where id = '${a.feedId}');

-- Segunda llamada dentro de las 6 horas.
select public.feed_health_watchdog();
${conteos('2')}
`);

    // ── ASERCIÓN 1 ────────────────────────────────────────────────────────
    expect(medida.feed_claves1).toBe('1');
    expect(medida.scope1).toBe('feed');
    expect(medida.motivo1).toBe('sin_respuesta');
    expect(medida.deA).toBe(medida.admins);
    // Va dirigida a CADA admin activo: `recipient_id` es NOT NULL y no existe
    // "una notificación para el rol".
    expect(medida.destinos).toBe(medida.admins);
    // Y trae el apartamento, que es lo que lleva al admin al sitio concreto.
    expect(medida.propiedad).toBe(medida.admins);

    // ── ASERCIÓN 3, EL CONTROL ────────────────────────────────────────────
    // Sin esto, la aserción 1 pasaría igual con un watchdog que alertara de
    // TODOS los feeds. Los dos frescos no producen nada.
    expect(medida.deB).toBe('0');
    expect(medida.deC).toBe('0');

    // ── ASERCIÓN 2 ────────────────────────────────────────────────────────
    // Ni una clave más ni una fila más. La compuerta de 6 horas sobre
    // `dead_alert_sent_at` y el índice único sobre `dedupe_key` cierran las dos
    // puertas.
    expect(medida.feed_claves2).toBe('1');
    expect(medida.feed_filas2).toBe(medida.feed_filas1);
  });

  test('14: el CUBO HORARIO es lo que produce repetición, no lo que la evita', async () => {
    const a = await sembrarFeed();
    const b = await sembrarFeed();

    // ══════════════════════════════════════════════════════════════════════
    // ESTA ES LA PARTE QUE SE LEE AL REVÉS DE COMO ES.
    //
    // Sin cubo de tiempo en la `dedupe_key`, un feed caído alertaría UNA vez y
    // nunca más: `notifications_dedupe_idx` mataría la segunda para siempre, y
    // el admin que marcó la primera como leída no volvería a saber que su
    // calendario sigue muerto. El cubo es lo que hace que la clave cambie cada
    // hora; la compuerta de 6 horas sobre `dead_alert_sent_at` es lo que baja
    // la cadencia efectiva.
    //
    // Las seis horas se simulan REBOBINANDO lo que ya pasó y no adelantando el
    // reloj: dentro de una transacción `now()` es constante, así que "siete
    // horas después" y "todo lo demás ocurrió siete horas antes" son el mismo
    // mundo, y el segundo sí se puede escribir.
    // ══════════════════════════════════════════════════════════════════════
    const medida = medirWatchdog(`
${soloEstosFeeds([a.feedId, b.feedId])}
update public.calendar_feeds set last_success_at = now() - interval '4 hours', last_error = null
 where id = '${a.feedId}';
update public.calendar_feeds set last_success_at = now() - interval '10 minutes', last_error = null
 where id = '${b.feedId}';

select public.feed_health_watchdog();
${conteos('1')}

-- (i) SOLO la compuerta: han pasado siete horas, pero la clave sigue siendo la
--     del cubo de ESTA hora.
update public.calendar_feeds set dead_alert_sent_at = now() - interval '7 hours' where id = '${a.feedId}';
select public.feed_health_watchdog();
${conteos('2')}

-- (ii) Además el cubo: la alerta que ya existía es la que se emitió hace siete
--      horas, así que su clave lleva el cubo de hace siete horas.
update public.notifications
   set dedupe_key = 'feed_dead:${a.feedId}:' || to_char(date_trunc('hour', now() - interval '7 hours'), 'YYYYMMDDHH24')
 where dedupe_key like 'feed_dead:%';
update public.calendar_feeds set dead_alert_sent_at = now() - interval '7 hours' where id = '${a.feedId}';
select public.feed_health_watchdog();
${conteos('3')}
`);

    expect(medida.feed_claves1).toBe('1');

    // (i) La compuerta abierta NO basta: el índice único sobre la clave del
    //     cubo actual sigue bloqueando. Es la demostración de que sin cubo la
    //     alerta se emitiría una sola vez en la vida.
    expect(medida.feed_claves2).toBe('1');
    expect(medida.feed_filas2).toBe(medida.feed_filas1);

    // (ii) Con el cubo movido, la alerta VUELVE. Dos claves lógicas: la de
    //      hace siete horas y la de ahora.
    expect(medida.feed_claves3).toBe('2');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ALERTA 2: EL PROPIO JOB DEJA DE CORRER (SYNC-10)
// ════════════════════════════════════════════════════════════════════════════

describe('el día que se caiga la sincronización entera', () => {
  test('4: TODOS los feeds obsoletos producen UNA alerta de job y CERO de feed', async () => {
    const a = await sembrarFeed();
    const b = await sembrarFeed();
    const c = await sembrarFeed();

    const medida = medirWatchdog(`
${soloEstosFeeds([a.feedId, b.feedId, c.feedId])}
update public.calendar_feeds set last_success_at = now() - interval '4 hours', last_error = null
 where id = any (array['${a.feedId}','${b.feedId}','${c.feedId}']::uuid[]);

select public.feed_health_watchdog();
${conteos('1')}
select 'scope|'  || coalesce(max(payload->>'scope'),  '<ninguno>') from public.notifications where dedupe_key like 'job_dead:%';
select 'motivo|' || coalesce(max(payload->>'motivo'), '<ninguno>') from public.notifications where dedupe_key like 'job_dead:%';
select 'feeds|'  || coalesce(max(payload->>'feeds'),  '<ninguno>') from public.notifications where dedupe_key like 'job_dead:%';
select 'propiedad_nula|' || count(*) from public.notifications where dedupe_key like 'job_dead:%' and property_id is null;
`);

    // ══════════════════════════════════════════════════════════════════════
    // EL DISCRIMINADOR ANTI-TORMENTA.
    //
    // Si TODOS los feeds activos están obsoletos a la vez, lo que se rompió NO
    // son 34 calendarios de Airbnb el mismo martes a la misma hora: es el
    // sistema de sincronización. Sin esta línea el admin recibe una alerta por
    // feed y NINGUNA que diga la verdad, y el ruido entierra la señal
    // exactamente el día en que más falta hace.
    // ══════════════════════════════════════════════════════════════════════
    expect(medida.job_claves1).toBe('1');
    // CERO, no "pocas".
    expect(medida.feed_claves1).toBe('0');
    expect(medida.feed_filas1).toBe('0');

    expect(medida.scope).toBe('job');
    expect(medida.motivo).toBe('todos_los_feeds_obsoletos');
    // El número sale del propio conteo, no de una constante escrita a mano.
    expect(medida.feeds).toBe('3');
    // No es de un apartamento concreto, y la fila lo dice.
    expect(Number(medida.propiedad_nula)).toBeGreaterThan(0);
  });

  test('5: la capa que NO es ciega a su propia muerte se computa al leer', async () => {
    const a = await sembrarFeed();
    const b = await sembrarFeed();

    // La consulta es la misma que hará el panel de la Fase 4: el `max` de
    // `last_success_at` sobre los feeds ACTIVOS. No la escribe ningún job, así
    // que se dispara aunque no corra absolutamente nada dentro de la base.
    const leer = (horas: number): Record<string, string> =>
      medirWatchdog(`
${soloEstosFeeds([a.feedId, b.feedId])}
update public.calendar_feeds set last_success_at = now() - interval '${horas} hours'
 where id = any (array['${a.feedId}','${b.feedId}']::uuid[]);
select 'max|'   || coalesce(to_char(max(f.last_success_at) at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS+00'), '<null>')
  from public.calendar_feeds f where f.is_active;
select 'ahora|' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS+00');
`);

    const caida = leer(4);
    const sana = leer(1);

    // La marca llega EXACTAMENTE con la forma que escribe Postgres, con espacio
    // y con desfase de dos dígitos. `Date.parse` sobre esa forma devuelve NaN
    // sin la normalización de `salud-sync.ts`, y el panel pintaría "caída" con
    // el sistema perfectamente sano.
    expect(caida.max).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00$/);

    expect(estadoDeSincronizacion(caida.max, Date.parse(`${caida.ahora.replace(' ', 'T')}:00`))).toBe(
      'caida',
    );
    // CONTROL: una hora no la dispara. Sin esto, una función que devolviera
    // siempre 'caida' pasaría la aserción de arriba.
    expect(estadoDeSincronizacion(sana.max, Date.parse(`${sana.ahora.replace(' ', 'T')}:00`))).toBe(
      'sana',
    );

    // Y sin feeds activos tampoco hay nada que decir salvo que no se sabe nada:
    // falla CERRADO.
    expect(estadoDeSincronizacion(null, Date.now())).toBe('caida');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ALERTA 3: CHECKOUT Y CHECKIN EL MISMO DÍA (SYNC-07)
// ════════════════════════════════════════════════════════════════════════════

describe('la urgencia del turnover del mismo día', () => {
  test('7: el feed real produce exactamente UN aseo urgente, y es el del turnover', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    await correrDiff(feedId, FEED_REAL);

    const hoy = hoyBogota();
    const aseos = await aseosDe(propertyId);
    const urgentes = aseos.filter((a) => a.is_urgent);

    // La expectativa se construye con la MISMA regla que el RPC
    // (`scheduled_date >= today_bog()`) y no con la fecha literal: así el test
    // sigue diciendo la verdad cuando el 2026-10-10 quede atrás.
    const esperados = DIA_DEL_TURNOVER >= hoy ? 1 : 0;
    expect(urgentes.length).toBe(esperados);
    if (esperados === 1) expect(urgentes[0].scheduled_date).toBe(DIA_DEL_TURNOVER);
  });

  test('8: si la reserva entrante se mueve, la urgencia SE APAGA SOLA', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    await correrDiff(feedId, FEED_REAL);
    expect((await aseosDe(propertyId)).filter((a) => a.is_urgent).length).toBe(1);

    // La reserva que ENTRABA el 2026-10-10 ahora entra el 11. Su `DTEND` no
    // cambia, así que no hay nada que reconciliar: lo único que se mueve es la
    // urgencia.
    const corrida = await correrDiff(
      feedId,
      conDtstart(FEED_REAL, '20261012', '20261011'),
    );
    expect(corrida.cuerpo.outcome).toBe('ok');
    expect(corrida.corrida?.cleanings_cancelled).toBe(0);

    // ══════════════════════════════════════════════════════════════════════
    // LA URGENCIA ES UN HECHO DERIVADO DEL FEED, NO UN EVENTO. Por eso el paso
    // (f) es `set is_urgent = exists (...)` y no un `set is_urgent = true`
    // condicional: si no se apagara sola, se acumularía y en un mes la mitad de
    // la agenda estaría marcada urgente y la marca no significaría nada.
    // ══════════════════════════════════════════════════════════════════════
    expect((await aseosDe(propertyId)).filter((a) => a.is_urgent).length).toBe(0);

    // Y el aseo del checkout de esa reserva sigue donde estaba y vivo.
    const salida = (await aseosDe(propertyId)).find(
      (a) => a.scheduled_date === SALIDA_DEL_ENTRANTE,
    );
    expect(salida?.state).toBe('pendiente');
    expect((await aseosVivosDe(propertyId)).length).toBe(15);
  });

  test('9: el recálculo sobre una unidad de gestión externa no revienta con 23514', async () => {
    const { propertyId, feedId } = await sembrarFeed({ gestionada: false });

    // Dos corridas: la segunda es la que de verdad ejercita el UPDATE del paso
    // (f) sobre filas que YA existen. Con la primera sola, un recálculo sin el
    // filtro por gestión podría no llegar a tocarlas.
    const uno = await correrDiff(feedId, FEED_REAL);
    const dos = await correrDiff(feedId, FEED_REAL);

    // ══════════════════════════════════════════════════════════════════════
    // SIN `and c.is_managed` EN EL PASO (f) ESTO REVIENTA CON 23514 sobre
    // `cl_unmanaged_is_inert`, que exige `is_urgent` falsa en una fila
    // informativa. Y el turnover del feed real cae dentro, así que no es un
    // caso de borde: hay CINCO unidades externas en la semilla y el fallo sería
    // en la primera corrida real, no en una rara.
    // ══════════════════════════════════════════════════════════════════════
    expect(uno.cuerpo.outcome).toBe('ok');
    expect(dos.cuerpo.outcome).toBe('ok');
    expect(dos.cuerpo.codigo).toBeUndefined();

    const aseos = await aseosDe(propertyId);
    expect(aseos.length).toBe(15);
    expect(aseos.every((a) => a.is_urgent === false)).toBe(true);
    expect(aseos.every((a) => a.state === null)).toBe(true);
    // CONTROL: el día del turnover SÍ está entre esas quince filas. Sin esto la
    // aserción pasaría por vacuidad si el feed no lo trajera.
    expect(aseos.some((a) => a.scheduled_date === DIA_DEL_TURNOVER)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ALERTA 4: EXTENSIÓN CREADA COMO RESERVA NUEVA (SYNC-08)
// ════════════════════════════════════════════════════════════════════════════

describe('la extensión mal creada, y lo que NO es una extensión', () => {
  test('10 y 12: se marca la fecha de unión, se crea el checkout nuevo, y la marca es pegajosa', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    await correrDiff(feedId, FEED_REAL);
    expect((await aseosDe(propertyId)).length).toBe(15);

    const t1 = await correrDiff(feedId, EXTENSION);
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.corrida?.reservation_count).toBe(16);

    const union = (await aseosDe(propertyId)).find((a) => a.scheduled_date === FECHA_DE_UNION);
    expect(union?.needs_review).toBe(true);
    expect(union?.review_reason).toBe('extension_sospechosa');

    expect(await alertasLogicas(propertyId, 'extension_sospechosa')).toEqual([
      `ext:${union?.id}`,
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // Y ADEMÁS CREA EL ASEO DEL CHECKOUT NUEVO. El sistema no se niega a
    // trabajar: si de verdad era una extensión el coste es un viaje de más y
    // una alerta; si no lo era, el coste de NO crear el aseo es un huésped
    // entrando a un apartamento sucio. La asimetría decide sola.
    // ══════════════════════════════════════════════════════════════════════
    const checkout = (await aseosDe(propertyId)).find(
      (a) => a.scheduled_date === CHECKOUT_DE_LA_EXTENSION,
    );
    expect(checkout?.state).toBe('pendiente');
    expect(checkout?.reservation_id).not.toBeNull();
    const nueva = (await reservasDe(propertyId)).find(
      (r) => r.id === checkout?.reservation_id,
    );
    expect(nueva?.starts_on).toBe(FECHA_DE_UNION);
    expect(nueva?.ends_on).toBe(CHECKOUT_DE_LA_EXTENSION);

    expect(await cancelados(propertyId)).toBe(0);
    expect((await aseosVivosDe(propertyId)).length).toBe(16);

    // ── ASERCIÓN 12: `needs_review` ES PEGAJOSO ───────────────────────────
    // Una segunda corrida limpia NO lo apaga. Apagarlo automáticamente haría
    // desaparecer la alerta antes de que nadie la atendiera; solo el admin lo
    // baja, en la Fase 4.
    const t2 = await correrDiff(feedId, EXTENSION);
    expect(t2.cuerpo.outcome).toBe('ok');
    const despues = (await aseosDe(propertyId)).find((a) => a.scheduled_date === FECHA_DE_UNION);
    expect(despues?.needs_review).toBe(true);
    expect(despues?.review_reason).toBe('extension_sospechosa');
  });

  test('11: EL TURNOVER SANO DEL FEED REAL NO PRODUCE extension_sospechosa', async () => {
    const { propertyId, feedId } = await sembrarFeed();

    await correrDiff(feedId, FEED_REAL);
    await correrDiff(feedId, FEED_REAL);

    // ══════════════════════════════════════════════════════════════════════
    // ES LA ASERCIÓN QUE SEPARA SYNC-07 DE SYNC-08.
    //
    // El feed real trae dos reservas SANAS encadenadas el 2026-10-10: una sale
    // y otra entra. Un detector que marcara todo lo pegado pasaría la fixture
    // de la extensión y convertiría el caso más común y más importante del
    // negocio en una falsa alarma PERMANENTE. En una semana el admin deja de
    // mirar las alertas, y a partir de ahí ninguna alerta del sistema sirve.
    //
    // Lo que los separa es SI LA RESERVA ANTERIOR SE MOVIÓ O DESAPARECIÓ EN LA
    // MISMA CORRIDA, y por eso R2 lleva esa condición y no solo la coincidencia
    // de fechas.
    // ══════════════════════════════════════════════════════════════════════
    expect(await alertasLogicas(propertyId, 'extension_sospechosa')).toEqual([]);
    expect(
      (await aseosDe(propertyId)).filter((a) => a.review_reason === 'extension_sospechosa').length,
    ).toBe(0);
    // Ni ninguna otra marca de revisión: la corrida es completamente limpia.
    expect((await aseosDe(propertyId)).filter((a) => a.needs_review).length).toBe(0);

    // CONTROL: el día del turnover existe y el aseo está ahí. Si el feed no lo
    // trajera, el cero de arriba no significaría nada.
    expect((await aseosDe(propertyId)).some((a) => a.scheduled_date === DIA_DEL_TURNOVER)).toBe(
      true,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ALERTA 5: FEED VACÍO, INVÁLIDO O TRUNCADO (SYNC-06)
// ════════════════════════════════════════════════════════════════════════════

describe('la otra mitad del feed degradado: deja registro y avisa', () => {
  test('13: cada forma degradada escribe su outcome, y el colapso produce UNA alerta de formato', async () => {
    const colapsado = await sembrarFeed();
    const html = await sembrarFeed();
    const truncado = await sembrarFeed();

    // Los tres arrancan sanos, con `last_success_at` fresco y quince aseos.
    for (const feed of [colapsado, html, truncado]) {
      const base = await correrDiff(feed.feedId, FEED_REAL);
      expect(base.cuerpo.outcome).toBe('ok');
    }

    // ── LOS TRES OUTCOMES EN feed_sync_runs ───────────────────────────────
    const vacio = await correrDiff(colapsado.feedId, fixture('vacio.ics'));
    expect(vacio.corrida?.outcome).toBe('colapso');
    expect(vacio.feed.last_error).toBe('cero_reservas_clasificadas');

    const conHtml = await correrSync(html.feedId, fixture('html-200.html'), {
      contentType: 'text/html; charset=utf-8',
    });
    expect(conHtml.corrida?.outcome).toBe('transporte');
    expect(conHtml.feed.last_error).toBe('content_type_html');

    const cortado = await correrDiff(truncado.feedId, fixture('airbnb-truncado.ics'));
    expect(cortado.corrida?.outcome).toBe('transporte');
    expect(cortado.feed.last_error).toBe('cuerpo_truncado');

    // Y ninguna de las tres canceló nada: es la mitad que ya midió el plan
    // 03-08, repetida aquí como centinela de que el registro no llegó a costa
    // del comportamiento.
    for (const feed of [colapsado, html, truncado]) {
      expect(await cancelados(feed.propertyId)).toBe(0);
      expect((await aseosVivosDe(feed.propertyId)).length).toBe(15);
    }

    // ══════════════════════════════════════════════════════════════════════
    // LA ALERTA DEL COLAPSO SALE DEL WATCHDOG, NO DEL RPC, Y ESO NO ES UN
    // DETALLE: el worker NO llama al RPC cuando cero eventos clasifican, así
    // que la alerta de `formato_desconocido` que el RPC emite es inalcanzable
    // por el camino real. Sin la condición propia del watchdog sobre
    // `last_error`, el modo de fallo más peligroso del producto —el día que
    // Airbnb cambie la forma del campo libre— sería COMPLETAMENTE SILENCIOSO.
    // ══════════════════════════════════════════════════════════════════════
    const medida = medirWatchdog(`
${soloEstosFeeds([colapsado.feedId, html.feedId, truncado.feedId])}
select public.feed_health_watchdog();
select 'fmt_claves|' || count(distinct dedupe_key) from public.notifications where dedupe_key like 'fmt:%';
select 'fmt_delA|'   || count(*) from public.notifications where dedupe_key like 'fmt:${colapsado.feedId}:%';
select 'motivo|'     || coalesce(max(payload->>'motivo'), '<ninguno>') from public.notifications where dedupe_key like 'fmt:%';
select 'scope|'      || coalesce(max(payload->>'scope'),  '<ninguno>') from public.notifications where dedupe_key like 'fmt:%';
select 'admins|'     || count(*) from public.profiles where role = 'admin' and is_active;
${conteos('1')}
`);

    expect(medida.fmt_claves).toBe('1');
    expect(medida.fmt_delA).toBe(medida.admins);
    expect(medida.motivo).toBe('formato_desconocido');
    expect(medida.scope).toBe('feed');
    // CONTROL: los otros dos fallaron por transporte, no por formato, y su
    // `last_success_at` sigue fresco. Ni una alerta de "sin respuesta".
    expect(medida.feed_claves1).toBe('0');
    expect(medida.job_claves1).toBe('0');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEDUPLICACIÓN DE LAS ALERTAS DEL RPC
// ════════════════════════════════════════════════════════════════════════════

describe('dos corridas idénticas no duplican la alerta', () => {
  test('14b: la alerta de aseo en revisión se emite una vez por dedupe_key', async () => {
    const { propertyId, feedId } = await sembrarFeed();
    await correrDiff(feedId, FEED_REAL);

    // El aseo del 2026-09-27 arranca: ya no se puede cancelar, así que la
    // reserva movida lo deja en revisión y con alerta, corrida tras corrida.
    const viejo = (await aseosDe(propertyId)).find((a) => a.scheduled_date === '2026-09-27');
    expect(viejo).toBeDefined();
    const admin = clienteAdminDePruebas();

    const { error } = await admin
      .from('cleanings')
      .update({
        confirmado_at: '2026-09-02T15:00:00.000Z',
        confirmado_by: '00000000-0000-4000-8000-000000000001',
        aseador_id: '00000000-0000-4000-8000-000000000002',
        num_huespedes: 2,
      })
      .eq('id', viejo?.id ?? '');
    expect(error).toBeNull();

    const { error: error2 } = await admin
      .from('cleanings')
      .update({ state: 'en_curso', started_at: '2026-09-02T16:00:00.000Z' })
      .eq('id', viejo?.id ?? '');
    expect(error2).toBeNull();

    const movida = fixture('airbnb-real-movida.ics');
    await correrDiff(feedId, movida);
    await correrDiff(feedId, conDtstamp(movida, '20260904T010203Z'));

    // ══════════════════════════════════════════════════════════════════════
    // Quien impide la repetición es `notifications_dedupe_idx` a través de
    // `dedupe_key`, no un `where` que dependa de haber sido el primero. Si el
    // anti-duplicado viviera en el `select` del RPC, la propiedad "una sola
    // alerta por aseo" no estaría probada por nada y bastaría un cambio en el
    // orden de los pasos para duplicarlas.
    //
    // Estas alertas van SIN cubo de tiempo, al revés que la de feed caído: son
    // un hecho puntual sobre un aseo concreto, y repetirlas cada media hora es
    // acoso porque el hecho no cambia.
    // ══════════════════════════════════════════════════════════════════════
    const claves = await alertasLogicas(propertyId);
    expect(claves).toEqual([`rev:${viejo?.id}`]);

    const filas = (await notificacionesDe(propertyId)).filter(
      (n) => n.dedupe_key === `rev:${viejo?.id}`,
    );
    const admins = Number(sqlDePruebas(
      "select count(*) from public.profiles where role = 'admin' and is_active;",
    )[0]);
    // Una fila POR ADMIN ACTIVO y no una por corrida: el fan-out es del
    // destinatario, la deduplicación es del hecho.
    expect(filas.length).toBe(admins);
  });
});
