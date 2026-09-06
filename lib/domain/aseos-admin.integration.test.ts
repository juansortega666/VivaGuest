import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { clienteAdminDePruebas, clienteConToken, type ClienteVivaGuest } from '@/lib/test/clientes';
import { leerAseo } from '@/lib/test/aseos';
import {
  aseosDe,
  aseosVivosDe,
  correrDiff,
  limpiarSync,
  sembrarFeed,
  sqlDePruebas,
  transicionesDe,
} from '@/lib/test/sync';

import { diaRelativo, feedConCheckoutRelativo } from './__fixtures__/ical/generar';

/**
 * LA ASERCIÓN DE MAYOR VALOR DE LA FASE 4: REPROGRAMAR CONTRA EL RECONCILE.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * NINGUNA ASERCIÓN pgTAP PUEDE MEDIR LO QUE MIDE ESTE ARCHIVO.
 *
 * `06_aseos_admin.test.sql` prueba que `reschedule_cleaning` mueve la fecha y
 * deja `reservation_id` en null. Eso es el MECANISMO. Lo que ninguna aserción
 * de esa suite puede probar es que el mecanismo SOBREVIVA a una corrida
 * completa de `sync_feed_apply()`, porque para eso hay que ejecutar el motor de
 * sincronización entero: fetch, parseo, clasificación, diff y reconcile.
 *
 * El hallazgo que motiva este archivo no estaba en ninguna de las preguntas que
 * la fase venía a contestar. `reschedule_cleaning` escrita de la forma obvia
 * —mover `scheduled_date` y nada más— queda DESHECHA por el propio motor treinta
 * minutos después: el bucle de reserva movida del reconcile (migración 13, paso
 * e.2) selecciona los aseos cuyo `scheduled_date` difiere del `ends_on` de SU
 * RESERVA y los cancela con `cancel_reason = 'reserva_movida'`, creando otro en
 * la fecha vieja. Un aseo reprogramado a mano cumple ese predicado EXACTAMENTE
 * IGUAL que uno cuya reserva se movió de verdad: para el sync, "el aseo no está
 * donde dice la reserva" tiene una sola explicación posible.
 *
 * El síntoma en producción sería el peor de todos: el trabajo del admin
 * desaparece solo, en otro archivo, media hora después, sin que nadie toque
 * nada.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ EL SEGUNDO ASEO EN D+5 ES CORRECTO Y NO UN BUG ─────────────────
 *
 * Desapuntar la reserva saca el aseo de las tres rutas destructivas del
 * reconcile, que sin excepción se anclan a `reservation_id`. La consecuencia
 * aceptada, y está escrita con estas mismas palabras en la migración 15, es que
 * el paso (c) del siguiente sync creará un aseo NUEVO en la fecha del checkout
 * real, porque ya no hay ningún aseo vivo apuntando a esa reserva. Reprogramar
 * produce DOS aseos: el que el admin movió, y uno sin confirmar en la fecha del
 * checkout, que cae en la bandeja donde el admin lo ve y lo cancela en diez
 * segundos si sobra.
 *
 * Es la asimetría declarada del proyecto, y por eso esta suite lo AFIRMA en vez
 * de tolerarlo: UN ASEO DE MÁS LO REVISA UN HUMANO; UN ASEO DE MENOS DEJA A LA
 * ASEADORA EN LA CALLE. Un efecto que solo se descubre en producción es un
 * defecto aunque la decisión sea correcta.
 *
 * LA ALTERNATIVA DESCARTADA, con su razón, para que no se reabra: poner
 * `origin = 'manual'` sacaría el aseo de todos los filtros del reconcile
 * conservando la reserva, y produciría exactamente un aseo. Pero si el admin
 * reprograma por error y no lo deshace, el día del checkout real se queda SIN
 * ASEO y nada vuelve a generarlo. Además `is_urgent` dejaría de recalcularse y
 * `origin` mentiría sobre la procedencia del aseo. La cuarta ruta del reconcile
 * —el recálculo de `is_urgent`, paso (f)— SÍ sigue actuando sobre un aseo
 * desanclado, y eso es lo correcto: recalcula la urgencia contra la fecha nueva.
 *
 * ── LA SEÑAL DE ALARMA, QUE ES LO QUE HAY QUE BUSCAR EN PRODUCCIÓN ─────────
 *
 * Si esto se rompe, el síntoma tiene una firma exacta y no se parece a nada más:
 *
 *     un aseo con `cancel_reason = 'reserva_movida'` cuya fila de
 *     `cleaning_state_transitions` hacia `cancelada` tiene `actor_id` NULO,
 *     apareciendo minutos después de que un admin lo reprogramara.
 *
 * `actor_id` nulo significa que quien escribió no era una persona: el trigger la
 * rellena con `auth.uid()`, que es nulo cuando escribe la clave de servicio o un
 * job de `pg_cron`. Si esa fila aparece, la RPC NO desancló la reserva. Es
 * exactamente la aserción que este archivo hace al revés.
 *
 * ── EL ARNÉS NO SE DUPLICA ────────────────────────────────────────────────
 *
 * La siembra de feeds sale de `lib/test/sync.ts` y la lectura de aseos de
 * `lib/test/aseos.ts`. Este archivo COMPONE los dos y no reimplementa ninguno:
 * un segundo sitio que sepa sembrar feeds es el sitio donde los dos se
 * desincronizan, y el que se queda atrás lo hace en silencio.
 *
 * Requiere `npx supabase start` con el stack COMPLETO (la creación del admin va
 * contra GoTrue) y `.env.local` con `CRON_SHARED_SECRET`.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.resched.admin.${SUFIJO}@vivaguest.test`;
const PASSWORD_ADMIN = `resched-admin-${randomUUID()}`;

/** Offset del checkout de la reserva única del feed. Lejos de la ventana protegida. */
const CHECKOUT = 5;
/** A dónde mueve el admin el aseo. Sigue en el futuro y no choca con nada. */
const REPROGRAMADO = 8;
/** El aseo manual del segundo caso, y a dónde se mueve. */
const MANUAL = 10;
const MANUAL_MOVIDO = 12;

let tokenAdmin = '';
let uidAdmin = '';
/** La responsable que `props_active_requires_owner` exige para activar. Ver `activar`. */
let uidAseadora = '';
/** El día de negocio SEGÚN LA BASE, que es quien decide la ventana protegida. */
let hoy = '';

function servicio(): ClienteVivaGuest {
  return clienteAdminDePruebas();
}

/** El cliente que habla como el admin. La RPC va con SU JWT, no con el de servicio. */
function comoAdmin(): ClienteVivaGuest {
  return clienteConToken(tokenAdmin);
}

beforeAll(async () => {
  hoy = sqlDePruebas('select public.today_bog();')[0];

  // El rol va en los DOS sitios y no es redundante: `app_metadata` lo emite
  // GoTrue dentro del JWT, y `user_metadata` es lo que lee `tg_handle_new_user`
  // para materializar la fila de `public.profiles` que consulta
  // `private.is_admin()`.
  const { data, error } = await servicio().auth.admin.createUser({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin De Reprogramacion' },
  });
  if (error || !data.user) throw new Error(`No se pudo crear el admin: ${error?.message}`);
  uidAdmin = data.user.id;

  const { data: sesion, error: errorSesion } = await servicio().auth.signInWithPassword({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
  });
  if (errorSesion || !sesion.session) {
    throw new Error(`No se pudo iniciar sesión como admin: ${errorSesion?.message}`);
  }
  tokenAdmin = sesion.session.access_token;

  const { data: aseadora, error: errorAseadora } = await servicio().auth.admin.createUser({
    email: `int.resched.aseadora.${SUFIJO}@vivaguest.test`,
    password: `resched-aseadora-${randomUUID()}`,
    email_confirm: true,
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: 'Aseadora De Reprogramacion' },
  });
  if (errorAseadora || !aseadora.user) {
    throw new Error(`No se pudo crear la aseadora: ${errorAseadora?.message}`);
  }
  uidAseadora = aseadora.user.id;
});

afterAll(async () => {
  // Los aseos y apartamentos sembrados por el arnés de sync, incluidos los que
  // crearon las RPC del admin sobre esos apartamentos, caen aquí. Va PRIMERO:
  // `properties.responsable_id` es `on delete restrict` contra `profiles`, así
  // que borrar a la aseadora antes daría 23503.
  await limpiarSync();
  const admin = servicio();
  if (uidAseadora) await admin.auth.admin.deleteUser(uidAseadora);
  if (uidAdmin) await admin.auth.admin.deleteUser(uidAdmin);
});

/**
 * Pone el apartamento en activo, con responsable.
 *
 * NO es cosmético y por eso lleva comentario. `properties.is_active` tiene
 * DEFAULT `false` (migración 03, deliberado: un apartamento se activa cuando ya
 * está configurado del todo) y `sembrarFeed()` no lo toca, porque el motor de
 * sync no lo mira. `create_manual_cleaning` SÍ lo exige, así que sin esto el
 * caso 3 muere con `apartamento_no_valido` y parecería un fallo de la RPC.
 *
 * El responsable va en la MISMA sentencia y tampoco es opcional:
 * `props_active_requires_owner` (migración 03) prohíbe activar una unidad
 * gestionada sin `responsable_id` ni `contacto_externo`, y las tarifas ya vienen
 * puestas desde `sembrarFeed()` por `props_active_requires_rates`.
 *
 * Se escribe con la clave de servicio y no con una RPC porque no hay ninguna:
 * el CRUD de apartamentos es de otra fase. Es siembra, no aserción.
 */
async function activar(propertyId: string): Promise<void> {
  const { error } = await servicio()
    .from('properties')
    .update({ is_active: true, responsable_id: uidAseadora })
    .eq('id', propertyId);
  if (error) throw new Error(`No se pudo activar el apartamento: ${error.message}`);
}

/** El único aseo del apartamento en esa fecha, cancelado o no. Lanza si hay otro número. */
async function aseoEn(propertyId: string, fecha: string) {
  const encontrados = (await aseosDe(propertyId)).filter((a) => a.scheduled_date === fecha);
  if (encontrados.length !== 1) {
    throw new Error(`Se esperaba UN aseo el ${fecha}, hay ${encontrados.length}.`);
  }
  return encontrados[0];
}

// ════════════════════════════════════════════════════════════════════════════
// CASO 1 — EL ASEO DE `ical` QUE EL ADMIN MUEVE
// ════════════════════════════════════════════════════════════════════════════

describe('reschedule_cleaning contra una corrida real de sync_feed_apply()', () => {
  test('1: el aseo reprogramado SOBREVIVE al sync, y el checkout real se repone', async () => {
    const dCheckout = diaRelativo(hoy, CHECKOUT).iso;
    const dNueva = diaRelativo(hoy, REPROGRAMADO).iso;
    const { propertyId, feedId } = await sembrarFeed();
    const cuerpo = feedConCheckoutRelativo([CHECKOUT], hoy);

    // ── Corrida 1: el estado de partida ────────────────────────────────────
    const t1 = await correrDiff(feedId, cuerpo);
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.corrida?.cleanings_created).toBe(1);

    const original = await aseoEn(propertyId, dCheckout);
    expect(original.origin).toBe('ical');
    expect(original.state).toBe('pendiente');
    // CONTROL: el aseo nace ANCLADO a su reserva. Sin esta aserción, un aseo que
    // naciera huérfano por otro motivo dejaría el resto del test verde sin
    // probar nada: el desanclado de la RPC no tendría nada que deshacer.
    expect(original.reservation_id).not.toBeNull();

    // ── El admin reprograma ────────────────────────────────────────────────
    const { error: errorRpc } = await comoAdmin().rpc('reschedule_cleaning', {
      p_cleaning: original.id,
      p_fecha: dNueva,
    });
    expect(errorRpc).toBeNull();

    const trasReprogramar = await leerAseo(original.id);
    expect(trasReprogramar?.scheduled_date).toBe(dNueva);
    // EL MECANISMO ENTERO, EN UNA LÍNEA. Lo que sigue mide que basta.
    expect(trasReprogramar?.reservation_id).toBeNull();

    // ── Corrida 2: EL MISMO FEED, SIN NINGÚN CAMBIO EN EL `.ics` ───────────
    // `correrDiff` solo mueve el `DTSTAMP`, que es lo que impide que el atajo
    // por hash del worker corte la corrida antes de llegar al RPC. Las fechas,
    // los UID y los códigos de reserva son idénticos: el calendario NO se movió.
    const t2 = await correrDiff(feedId, cuerpo);
    expect(t2.cuerpo.outcome).toBe('ok');
    // Nada se cancela. Este contador es la primera línea de defensa y el señuelo
    // lo pone en 1.
    expect(t2.corrida?.cleanings_cancelled).toBe(0);

    // ── EL ASEO DEL ADMIN SIGUE DONDE LO DEJÓ ──────────────────────────────
    const reprogramado = await leerAseo(original.id);
    expect(reprogramado?.scheduled_date).toBe(dNueva);
    expect(reprogramado?.state).toBe('pendiente');
    expect(reprogramado?.cancelled_at).toBeNull();
    expect(reprogramado?.cancel_reason).toBeNull();
    expect(reprogramado?.reservation_id).toBeNull();
    // No se cancela Y TAMPOCO se marca para revisión: las ramas 2 y 3 del bucle
    // de reserva movida son el otro final posible de esa ruta, y un aseo
    // desanclado no entra en ninguna.
    expect(reprogramado?.needs_review).toBe(false);
    expect(reprogramado?.review_reason).toBeNull();

    // ── EL CHECKOUT REAL SE REPONE, Y ESO SE AFIRMA ────────────────────────
    // Es la consecuencia aceptada de la decisión, no un efecto que se descubre
    // en producción. Ver la cabecera del archivo.
    const repuesto = await aseoEn(propertyId, dCheckout);
    expect(repuesto.id).not.toBe(original.id);
    expect(repuesto.origin).toBe('ical');
    expect(repuesto.state).toBe('pendiente');
    expect(repuesto.confirmado_at).toBeNull();
    expect(repuesto.aseador_id).toBeNull();
    // Hereda la reserva que el admin soltó: el aseo del checkout real vuelve a
    // estar anclado, así que el reconcile lo sigue gobernando con normalidad.
    expect(repuesto.reservation_id).toBe(original.reservation_id);
    expect(t2.corrida?.cleanings_created).toBe(1);

    // Dos aseos vivos y CERO cancelados. El conteo es la forma más barata de
    // detectar que el motor hizo algo de más por una ruta que no se previó.
    const vivos = await aseosVivosDe(propertyId);
    expect(vivos.length).toBe(2);
    expect(vivos.map((a) => a.scheduled_date).sort()).toEqual([dCheckout, dNueva]);
    expect((await aseosDe(propertyId)).length).toBe(2);
  });

  test('2: la bitácora NO tiene una cancelación anónima sobre el aseo reprogramado', async () => {
    const dCheckout = diaRelativo(hoy, CHECKOUT).iso;
    const dNueva = diaRelativo(hoy, REPROGRAMADO).iso;
    const { propertyId, feedId } = await sembrarFeed();
    const cuerpo = feedConCheckoutRelativo([CHECKOUT], hoy);

    await correrDiff(feedId, cuerpo);
    const original = await aseoEn(propertyId, dCheckout);

    const { error } = await comoAdmin().rpc('reschedule_cleaning', {
      p_cleaning: original.id,
      p_fecha: dNueva,
    });
    expect(error).toBeNull();

    await correrDiff(feedId, cuerpo);

    // ══════════════════════════════════════════════════════════════════════
    // LA FIRMA EXACTA DEL FALLO, AFIRMADA AL REVÉS.
    //
    // `actor_id` nulo distingue "lo canceló el sync" de "lo canceló el admin":
    // el trigger la rellena con `auth.uid()`, nula cuando escribe la clave de
    // servicio o `pg_cron`. Una fila hacia `cancelada` con `actor_id` nulo
    // sobre un aseo que un humano acaba de reprogramar es EL síntoma, y es lo
    // que hay que buscar en producción si esto se rompe.
    // ══════════════════════════════════════════════════════════════════════
    const bitacora = await transicionesDe(original.id);
    const anonimasHaciaCancelada = bitacora.filter(
      (t) => t.to_state === 'cancelada' && t.actor_id === null,
    );
    expect(anonimasHaciaCancelada).toEqual([]);

    // CONTROL de la aserción de vacío, regla heredada del plan 02-09: la
    // bitácora del aseo REPUESTO en la fecha del checkout tampoco tiene
    // cancelaciones, así que el vacío de arriba no lo produce una tabla que
    // nunca se escribe para este apartamento. Lo que sí existe es el aseo.
    const repuesto = await aseoEn(propertyId, dCheckout);
    expect(repuesto.state).toBe('pendiente');
    expect(repuesto.cancel_reason).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CASO 2 — EL ASEO `manual`, QUE NUNCA TUVO RESERVA
// ════════════════════════════════════════════════════════════════════════════

describe('reschedule_cleaning sobre un aseo manual', () => {
  test('3: sobrevive a la corrida y el sync no crea nada extra', async () => {
    const dCheckout = diaRelativo(hoy, CHECKOUT).iso;
    const dManual = diaRelativo(hoy, MANUAL).iso;
    const dManualMovido = diaRelativo(hoy, MANUAL_MOVIDO).iso;
    const { propertyId, feedId } = await sembrarFeed();
    await activar(propertyId);
    const cuerpo = feedConCheckoutRelativo([CHECKOUT], hoy);

    const t1 = await correrDiff(feedId, cuerpo);
    expect(t1.cuerpo.outcome).toBe('ok');
    expect(t1.corrida?.cleanings_created).toBe(1);

    // El aseo manual lo crea la RPC del admin, no el arnés: `origin = 'manual'`
    // y `reservation_id` nulo desde el nacimiento es exactamente el caso que
    // este test quiere medir, y crearlo con la clave de servicio permitiría
    // sembrar una forma que la base nunca produce.
    const { data: idManual, error: errorCrear } = await comoAdmin().rpc('create_manual_cleaning', {
      p_property: propertyId,
      p_fecha: dManual,
      p_tipo: 'repaso',
    });
    expect(errorCrear).toBeNull();
    expect(typeof idManual).toBe('string');

    const manual = await leerAseo(idManual as string);
    expect(manual?.origin).toBe('manual');
    expect(manual?.reservation_id).toBeNull();

    const { error: errorMover } = await comoAdmin().rpc('reschedule_cleaning', {
      p_cleaning: idManual as string,
      p_fecha: dManualMovido,
    });
    expect(errorMover).toBeNull();

    const t2 = await correrDiff(feedId, cuerpo);
    expect(t2.cuerpo.outcome).toBe('ok');
    expect(t2.corrida?.cleanings_cancelled).toBe(0);
    // NADA EXTRA. El aseo del checkout sigue vivo y anclado a su reserva, así
    // que el paso (c) no tiene hueco que llenar. Es la diferencia con el caso 1
    // y es lo que demuestra que el aseo de más de allí sale del desanclado y no
    // de que el sync cree por sistema.
    expect(t2.corrida?.cleanings_created).toBe(0);

    const trasSync = await leerAseo(idManual as string);
    expect(trasSync?.scheduled_date).toBe(dManualMovido);
    expect(trasSync?.state).toBe('pendiente');
    expect(trasSync?.origin).toBe('manual');
    expect(trasSync?.cancelled_at).toBeNull();
    expect(trasSync?.cancel_reason).toBeNull();
    expect(trasSync?.needs_review).toBe(false);

    const vivos = await aseosVivosDe(propertyId);
    expect(vivos.length).toBe(2);
    expect(vivos.map((a) => a.scheduled_date).sort()).toEqual([dCheckout, dManualMovido]);
    expect((await aseosDe(propertyId)).length).toBe(2);
  });
});
