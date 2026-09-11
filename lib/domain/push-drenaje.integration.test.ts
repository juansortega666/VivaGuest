import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { clienteAdminDePruebas, clienteConToken, type ClienteVivaGuest } from '@/lib/test/clientes';
import { limpiarAseos, sembrarEscenarioDeAseos, type EscenarioDeAseos } from '@/lib/test/aseos';
import {
  cuerpoDescifradoDe,
  drenar,
  invocarWorker,
  levantarPushFalso,
  limpiarPush,
  peticionDeDrenaje,
  peticionesDe,
  programarRespuesta,
  registrarNotificacion,
  sembrarNotificacion,
  sembrarSuscripcion,
} from '@/lib/test/push';

/**
 * LA COSTURA QUE NINGUNA OTRA CAPA DE ESTA FASE PUEDE MEDIR.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * `errores.test.ts` prueba que `decidir(410, …)` devuelve `desactivar_suscripcion`.
 * `push.test.ts` prueba que `revocarSuscripcion()` escribe dos columnas. Lo que
 * NINGUNO de los dos puede probar es que un `410` DE VERDAD, viajando por el
 * `https.request` de Node dentro de `web-push`, acabe escribiendo `revoked_at` en
 * la fila correcta de la base de verdad.
 *
 * Por eso aquí no se usa `msw` y el `05-RESEARCH.md` lo dice explícito: `web-push`
 * no pasa por `fetch`, así que interceptar `fetch` mediría un camino que en
 * producción no existe. Hay un push service FALSO pero REAL, escuchando TLS en un
 * puerto de esta máquina, y las suscripciones de prueba apuntan a él.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA PROPIEDAD QUE JUSTIFICA EL ARCHIVO ENTERO ───────────────────────────
 *
 * El último caso —confirmar un aseo con el RPC real y el JWT real del admin y
 * seguir la cadena hasta la petición saliente— es el criterio 2 del ROADMAP
 * MEDIDO en vez de argumentado. Todo lo que hay entre `confirm_cleaning` y el
 * socket está compuesto de piezas que ya tienen su test; lo que no tenía ninguno
 * es que esas piezas estuvieran ENCHUFADAS entre sí.
 *
 * ── LA CORRECCIÓN DE I3/I4 QUE INTRODUJO EL PLAN 05-06 ────────────────────
 *
 * El `05-RESEARCH.md` propone para I3 una guarda de colapso POR UMBRAL: si las
 * desactivaciones de una corrida superan un porcentaje, abortar. Ese diseño no
 * mapea a un worker que procesa UNA notificación contra las suscripciones de UN
 * destinatario: no hay radio de explosión que medir, y el umbral sería código
 * muerto o se dispararía en el caso legítimo (alguien reinstaló la PWA). La
 * propiedad que la guarda protegía —una configuración rota no borra la flota— la
 * consigue `abortar_corrida`, y aquí se mide como lo que es: CERO filas con
 * `revoked_at`.
 *
 * ── ESTA SUITE NO PUEDE CORRER CON UN SERVIDOR DE LA APLICACIÓN LEVANTADO ──
 *
 * El trigger `notifications_disparar_push` de la migración 17 encola un POST real
 * al worker en cuanto se inserta una notificación. Con el Vault local vacío se
 * queda en un `raise warning` y no pasa nada; con los dos secretos puestos Y un
 * servidor escuchando, ese POST reclamaría la notificación antes que el test y
 * los contadores dejarían de medir lo que dicen. `drenar()` lo detecta y lo
 * explica en vez de dejar que salga como un `expect` desconcertante.
 *
 * Requiere `npx supabase start` y `.env.local` con `CRON_SHARED_SECRET`,
 * `APP_BASE_URL` y el par VAPID.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.push.admin.${SUFIJO}@vivaguest.test`;
const PASSWORD_ADMIN = `push-admin-${randomUUID()}`;

let tokenAdmin = '';
let uidAdmin = '';

function servicio(): ClienteVivaGuest {
  return clienteAdminDePruebas();
}

/**
 * Un escenario NUEVO por caso, y no uno compartido.
 *
 * `leerSuscripcionesVivas()` resuelve POR DESTINATARIO, así que dos casos que
 * compartieran aseadora compartirían suscripciones: el `410` del primero dejaría
 * al segundo sin destino vivo y el fallo aparecería en el caso equivocado. Es más
 * barato pagar la siembra que depurar eso.
 */
async function aseadoraNueva(): Promise<EscenarioDeAseos> {
  return sembrarEscenarioDeAseos();
}

beforeAll(async () => {
  await levantarPushFalso();

  // El rol va en los DOS sitios y no es redundante: `app_metadata` lo emite
  // GoTrue dentro del JWT, y `user_metadata` es lo que lee `tg_handle_new_user`
  // para materializar la fila de `public.profiles` que consulta
  // `private.is_admin()`.
  const { data, error } = await servicio().auth.admin.createUser({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin De Drenaje' },
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
});

afterAll(async () => {
  // El falso se cierra aquí dentro. `limpiarPush()` va ANTES de `limpiarAseos()`
  // porque borra por id; después las filas ya no existirían (caen por cascade
  // desde `profiles`) y el borrado sería un no-op silencioso.
  await limpiarPush();
  await limpiarAseos();
  if (uidAdmin) await servicio().auth.admin.deleteUser(uidAdmin);
});

// ════════════════════════════════════════════════════════════════════════════
// I1 — UN `410` DESACTIVA ESA SUSCRIPCIÓN, Y NO SE VUELVE A INTENTAR CONTRA ELLA
// ════════════════════════════════════════════════════════════════════════════

describe('I1: un 410 desactiva esa suscripción y no se reintenta contra ella', () => {
  test('la fila queda revocada con http_410, y el siguiente aviso no la toca', async () => {
    const e = await aseadoraNueva();
    const sub = await sembrarSuscripcion({ userId: e.aseadorA });
    programarRespuesta(sub.destino, { status: 410 });

    const n1 = await sembrarNotificacion({ recipientId: e.aseadorA });
    const r1 = await drenar(n1.id);

    // CONTROL: el aviso SALIÓ. Sin esto, un fallo que impidiera el envío dejaría
    // el resto del caso verde sin haber ejercitado la respuesta hostil.
    expect(r1.hits).toBe(1);
    expect(r1.status).toBe(200);
    expect(r1.cuerpo.revocadas).toBe(1);

    const revocada = r1.suscripciones.find((s) => s.id === sub.id);
    expect(revocada?.revoked_at).not.toBeNull();
    // El motivo es un CÓDIGO de la unión cerrada, no un trozo del cuerpo que
    // mandó el push service (T-05-22).
    expect(revocada?.revoked_reason).toBe('http_410');

    // ── LA MITAD QUE DE VERDAD IMPORTA ───────────────────────────────────────
    // Un aviso NUEVO para la misma aseadora. Si la revocación no hubiera
    // surtido efecto, el falso recibiría una segunda petición y el ciclo
    // siguiente reintentaría contra un teléfono muerto para siempre.
    const n2 = await sembrarNotificacion({ recipientId: e.aseadorA });
    const r2 = await drenar(n2.id);

    expect(r2.hits).toBe(0);
    expect(peticionesDe(sub.destino).hits).toBe(1);
    expect(r2.cuerpo.outcome).toBe('sin_destino');
    expect(r2.notificacion.push_status).toBe('descartado');
    expect(r2.notificacion.push_last_error).toBe('sin_suscripciones');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// I2 — UN `429` CON `Retry-After` NO DESACTIVA NADA
// ════════════════════════════════════════════════════════════════════════════

describe('I2: un 429 con Retry-After reprograma y NO desactiva', () => {
  test('la notificación vuelve a pendiente a +60 s y la suscripción sigue viva', async () => {
    const e = await aseadoraNueva();
    const sub = await sembrarSuscripcion({ userId: e.aseadorA });
    programarRespuesta(sub.destino, {
      status: 429,
      headers: { 'Retry-After': '60' },
      body: JSON.stringify({ reason: 'TooManyRequests' }),
    });

    const n = await sembrarNotificacion({ recipientId: e.aseadorA });

    const antes = Date.now();
    const r = await drenar(n.id);
    const despues = Date.now();

    expect(r.hits).toBe(1);
    expect(r.cuerpo.outcome).toBe('reintento');
    expect(r.notificacion.push_status).toBe('pendiente');
    expect(r.notificacion.push_attempts).toBe(1);
    expect(r.notificacion.push_last_error).toBe('http_429');

    // LA ESPERA ES LA QUE PIDIÓ EL PUSH SERVICE, NO LA DE LA TABLA.
    //
    // El número distingue tres cosas que sin él se confundirían: los 60 s de la
    // cabecera, los 120 s del lease que escribe `reclamarNotificacion()`, y los
    // 60 000 ms de la primera casilla de `ESPERAS_MS`. Que la primera casilla
    // coincida con la cabecera es casualidad del caso; lo que se afirma es que la
    // escritura FINAL pisó el lease, que es lo que no se puede dar por hecho.
    const programado = new Date(r.notificacion.next_attempt_at).getTime();
    expect(programado).toBeGreaterThanOrEqual(antes + 60_000 - 2_000);
    expect(programado).toBeLessThanOrEqual(despues + 60_000 + 2_000);

    // EL SEÑUELO VIVE AQUÍ: desactivar ante un 429 deja sin canal a una aseadora
    // por una respuesta que solo decía "ahora no".
    const viva = r.suscripciones.find((s) => s.id === sub.id);
    expect(viva?.revoked_at).toBeNull();
    expect(viva?.revoked_reason).toBeNull();
    expect(viva?.failure_count).toBe(1);
    expect(viva?.last_failure_at).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// I3/I4 — UN `403 BadJwtToken` ABORTA LA CORRIDA Y NO REVOCA NADA
// ════════════════════════════════════════════════════════════════════════════

describe('I3/I4: una configuración rota aborta la corrida sin revocar ni una fila', () => {
  test('con dos suscripciones y 403 a todo, CERO quedan revocadas', async () => {
    const e = await aseadoraNueva();
    const uno = await sembrarSuscripcion({ userId: e.aseadorA });
    const dos = await sembrarSuscripcion({ userId: e.aseadorA });

    const respuesta403 = {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'BadJwtToken' }),
    };
    programarRespuesta(uno.destino, respuesta403);
    programarRespuesta(dos.destino, respuesta403);

    const n = await sembrarNotificacion({ recipientId: e.aseadorA });
    const r = await drenar(n.id);

    expect(r.cuerpo.outcome).toBe('abortada');
    expect(r.cuerpo.suscripciones).toBe(2);

    // SE CORTA AL PRIMER FALLO. Procesar las dos sería tratar un problema
    // global como si fuera uno por dispositivo, que es el señuelo de I4.
    expect(r.hits).toBe(1);

    // ── LA ASERCIÓN QUE SALVA LA FLOTA ───────────────────────────────────────
    // Se CUENTAN las filas revocadas y se exige cero. Contarlas, y no leer una,
    // es la diferencia: con la variante rota la primera podría quedar intacta y
    // la segunda no, o al revés, según el orden que devuelva PostgREST.
    const revocadas = r.suscripciones.filter((s) => s.revoked_at !== null);
    expect(revocadas).toHaveLength(0);
    expect(r.suscripciones.filter((s) => s.revoked_reason !== null)).toHaveLength(0);
    expect(r.suscripciones).toHaveLength(2);

    // La notificación vuelve a la cola: el problema es de configuración y se
    // puede arreglar, así que descartarla perdería el aviso.
    expect(r.notificacion.push_status).toBe('pendiente');

    // EL MOTIVO ES EL `reason` DE LA UNIÓN CERRADA, NO `configuracion_rota`.
    // Ver la desviación anotada en el SUMMARY: `configuracion_rota` es lo que
    // nace EN el worker cuando falta configuración propia (el origen absoluto, o
    // el par VAPID); cuando quien informa del problema es el push service, lo que
    // se guarda es su `reason`, que es más específico y dice CUÁL está rota.
    expect(r.notificacion.push_last_error).toBe('BadJwtToken');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// I5 — IDEMPOTENCIA, MEDIDA EN PETICIONES SALIENTES
// ════════════════════════════════════════════════════════════════════════════

describe('I5: drenar dos veces la misma notificación produce UNA petición', () => {
  test('la segunda invocación no encuentra nada que reclamar', async () => {
    const e = await aseadoraNueva();
    const sub = await sembrarSuscripcion({ userId: e.aseadorA });

    const n = await sembrarNotificacion({ recipientId: e.aseadorA });

    const primera = await drenar(n.id);
    expect(primera.cuerpo.outcome).toBe('enviado');
    expect(primera.hits).toBe(1);

    const segunda = await drenar(n.id, { esperaYaProcesada: true });
    expect(segunda.cuerpo.outcome).toBe('ya_procesada');

    // ── SE MIDE EL CONTADOR, NO EL ESTADO ────────────────────────────────────
    // El estado de la fila coincidiría por casualidad: `enviado` después de un
    // envío y `enviado` después de DOS envíos son la misma fila. La única
    // evidencia de que el aseador no recibió el aviso dos veces es que solo salió
    // una petición.
    expect(segunda.hits).toBe(0);
    expect(peticionesDe(sub.destino).hits).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// I6 — SIN DESTINO NO ES UN NO-OP: ES UNA FILA QUE LO DICE
// ════════════════════════════════════════════════════════════════════════════

describe('I6: un aseador sin suscripción viva deja constancia, no silencio', () => {
  test('descartado con sin_suscripciones, y cero peticiones al push service', async () => {
    const e = await aseadoraNueva();
    // A propósito: NO se siembra ninguna suscripción para esta aseadora.
    const n = await sembrarNotificacion({ recipientId: e.aseadorB });
    const r = await drenar(n.id);

    expect(r.hits).toBe(0);
    expect(r.suscripciones).toHaveLength(0);
    expect(r.cuerpo.outcome).toBe('sin_destino');

    // ── EL SEÑUELO QUE PROTEGE LA PROMESA CENTRAL DEL PRODUCTO ───────────────
    // Marcarla `enviado` sería mentir: nadie recibió nada. Esta fila es la que
    // hace visible en el panel de D-03 que un aseo confirmado no le va a sonar a
    // su responsable.
    expect(r.notificacion.push_status).toBe('descartado');
    expect(r.notificacion.push_status).not.toBe('enviado');
    expect(r.notificacion.push_last_error).toBe('sin_suscripciones');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// I7 — EL GUARD DEL ENDPOINT
// ════════════════════════════════════════════════════════════════════════════

describe('I7: el worker niega con 401 SIN CUERPO sin el secreto compartido', () => {
  test('sin header, con el header vacío y con un secreto equivocado', async () => {
    const e = await aseadoraNueva();
    const sub = await sembrarSuscripcion({ userId: e.aseadorA });
    const n = await sembrarNotificacion({ recipientId: e.aseadorA });
    const cuerpo = JSON.stringify({ notification_id: n.id });

    for (const secreto of [null, '', `no-es-${randomUUID()}`]) {
      const respuesta = await invocarWorker(peticionDeDrenaje(cuerpo, secreto));
      expect(respuesta.status).toBe(401);
      // SIN CUERPO: distinguir "no mandaste header" de "el secreto no coincide"
      // es información gratis para quien sondea el endpoint (T-05-01).
      expect(await respuesta.text()).toBe('');
    }

    // Y nada de eso llegó a tocar la cola ni el push service.
    expect(peticionesDe(sub.destino).hits).toBe(0);
    const { data } = await servicio()
      .from('notifications')
      .select('push_status, push_attempts')
      .eq('id', n.id)
      .single();
    expect(data?.push_status).toBe('pendiente');
    expect(data?.push_attempts).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D-07 — LAS DOS ENVOLTURAS, ELEGIDAS POR DISPOSITIVO
// ════════════════════════════════════════════════════════════════════════════

describe('D-07: el formato del cuerpo lo decide el dispositivo, no la notificación', () => {
  test('la misma notificación sale declarativa a uno y clásica al otro', async () => {
    const e = await aseadoraNueva();
    const moderno = await sembrarSuscripcion({ userId: e.aseadorA, soportaDeclarativo: true });
    const clasico = await sembrarSuscripcion({ userId: e.aseadorA, soportaDeclarativo: false });

    const n = await sembrarNotificacion({ recipientId: e.aseadorA, url: '/aseos/abc' });
    const r = await drenar(n.id);

    expect(r.cuerpo.outcome).toBe('enviado');
    expect(r.cuerpo.entregadas).toBe(2);
    expect(r.hits).toBe(2);

    // ── SE DESCIFRA DE VERDAD, NO SE MIDE LA LONGITUD ───────────────────────
    // El plan aceptaba afirmar sobre la longitud del cuerpo cifrado como
    // alternativa. Se descartó: una longitud distinta prueba que el JSON es más
    // largo, no que la envoltura declarativa lleve su clave. Descifrar cuesta
    // veinticinco líneas de `node:crypto` en el arnés y convierte esto en la
    // aserción que D-07 pide de verdad. Ver `cuerpoDescifradoDe()`.
    const declarativo = JSON.parse(cuerpoDescifradoDe(moderno.destino)) as Record<string, unknown>;
    const plano = JSON.parse(cuerpoDescifradoDe(clasico.destino)) as Record<string, unknown>;

    // La clave mágica del formato declarativo. Sin ella se pierde la red de
    // seguridad del sistema operativo, que es lo que evita la penalización por
    // no mostrar nada.
    expect(declarativo.web_push).toBe(8030);
    expect(declarativo.notification).toBeDefined();
    expect(declarativo.datos).toBeDefined();

    expect(plano.web_push).toBeUndefined();
    expect(plano.notification).toBeUndefined();
    expect(plano.datos).toBeDefined();

    // Y EL CÓDIGO DE ACCESO NO PUEDE ESTAR, PORQUE NO TIENE POR DÓNDE (D-06).
    // La comprobación se hace sobre el texto entero, que es donde estaría si
    // alguien ensanchara `EntradaDePayload` algún día.
    const textoDeclarativo = cuerpoDescifradoDe(moderno.destino);
    expect(textoDeclarativo).not.toContain('access_code');
    expect(textoDeclarativo).not.toContain('codigo_acceso');

    // Las dos cabeceras que gobiernan el colapso y la retención viajaron.
    const cabeceras = peticionesDe(moderno.destino).peticiones[0].cabeceras;
    expect(cabeceras.ttl).toBe(String(4 * 60 * 60));
    expect(cabeceras.urgency).toBe('high');
    expect(cabeceras.topic).toHaveLength(22);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DE PUNTA A PUNTA — EL CRITERIO 2 DEL ROADMAP, MEDIDO
// ════════════════════════════════════════════════════════════════════════════

describe('confirmar un aseo con el JWT del admin acaba en una petición saliente', () => {
  test('confirm_cleaning → notifications → worker → push service', async () => {
    const e = await aseadoraNueva();
    const sub = await sembrarSuscripcion({ userId: e.aseadorA });

    // EL RPC DE VERDAD, CON EL JWT DE VERDAD. No con la clave de servicio: ese
    // camino se salta `private.is_admin()` y mediría otra cosa.
    const { error } = await clienteConToken(tokenAdmin).rpc('confirm_cleaning', {
      p_cleaning: e.aseoSinConfirmar,
      p_num_huespedes: 2,
      p_instrucciones: 'Dejar toallas extra',
    });
    expect(error).toBeNull();

    // El aviso lo escribió el RPC dentro de SU transacción, no este test.
    const { data: avisos } = await servicio()
      .from('notifications')
      .select('*')
      .eq('cleaning_id', e.aseoSinConfirmar)
      .eq('type', 'asignacion');

    expect(avisos).toHaveLength(1);
    const aviso = avisos![0];
    registrarNotificacion(aviso.id);

    // Va al RESPONSABLE del apartamento, que es quien tiene el teléfono.
    expect(aviso.recipient_id).toBe(e.aseadorA);
    expect(aviso.push_status).toBe('pendiente');
    expect(aviso.url).toBe(`/aseos/${e.aseoSinConfirmar}`);

    const r = await drenar(aviso.id);

    // UNA petición saliente. Es el eslabón que ninguna otra capa puede medir.
    expect(r.hits).toBe(1);
    expect(peticionesDe(sub.destino).hits).toBe(1);
    expect(r.cuerpo.outcome).toBe('enviado');
    expect(r.notificacion.push_status).toBe('enviado');
    expect(r.notificacion.push_last_error).toBeNull();

    const viva = r.suscripciones.find((s) => s.id === sub.id);
    expect(viva?.revoked_at).toBeNull();
    expect(viva?.failure_count).toBe(0);
    expect(viva?.last_success_at).not.toBeNull();
    // Fresco: de esta corrida, no de una siembra.
    const exito = new Date(viva!.last_success_at!).getTime();
    expect(Date.now() - exito).toBeLessThan(2 * 60_000);

    // Y el contenido del aviso lleva el apartamento, sin el código de acceso.
    const texto = cuerpoDescifradoDe(sub.destino);
    expect(texto).toContain('Nuevo aseo asignado');
    expect(texto).toContain(`/aseos/${e.aseoSinConfirmar}`);
  });
});
