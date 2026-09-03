import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Database } from '@/lib/database.types';
import {
  actualizarSaludSiExiste,
  leerFeedDeApartamento,
  registrarSaludDelFeed,
  resumirFallo,
  PROVEEDOR_AIRBNB,
} from '@/lib/data/feeds';
import { clienteAdminDePruebas, clienteConToken, type ClienteVivaGuest } from '@/lib/test/clientes';

/**
 * LA COSTURA CON LA FASE 3, CONTRA LA BASE REAL.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO EXISTE POR UNA SOLA ASERCIÓN: conectar un calendario NO escribe
 * `calendar_reservations` NI `cleanings`. Ese es el criterio 6 de 02-VALIDATION
 * y lo que mantiene honesta la frontera con la Fase 3, que está bloqueada por un
 * prerequisito humano y no se adelanta aquí. Si algún día se pone en rojo, es
 * porque alguien metió el pipeline de sincronización en esta rebanada.
 *
 * Y LA ASERCIÓN ESTÁ ARMADA PARA QUE PUEDA FALLAR, que es lo que le da valor.
 * Un `expect(antes).toBe(despues)` entre dos ceros pasa trivialmente: pasa igual
 * si el conteo está roto, si la tabla no existe o si el fixture nunca se sembró.
 * Aquí hay dos defensas contra ese falso verde:
 *
 *   1. CENTINELA. Antes de medir se siembra UNA fila en cada una de las dos
 *      tablas, así que la igualdad es `1 === 1` y no `0 === 0`.
 *   2. CONTROL DEL CONTADOR. Se demuestra, en el mismo test, que el contador SÍ
 *      se mueve cuando de verdad se escribe una fila: sube a 2 y vuelve a 1.
 *      Sin esto, un contador que devolviera siempre el mismo número pasaría.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este archivo NO invoca las Server Actions de
 * `app/(admin)/apartamentos/[id]/calendario/_actions.ts`: una action arrastra
 * `next/cache` y el almacén de cookies de una petición, que fuera de Next no
 * existen (misma razón que documentan los otros `*.integration.test.ts`). Lo que
 * sí se ejercita es LA MISMA función que la action usa para escribir la salud,
 * `registrarSaludDelFeed` de `lib/data/feeds.ts`, con el mismo cliente que la
 * action le pasa. La única pieza que se reproduce a mano es el upsert de
 * `property_secrets`, y es porque el guardarraíl 8 de CI exige que esa tabla se
 * nombre en la misma función que construye la fábrica administrativa.
 *
 * Requiere `npx supabase start` y `.env.local` con los valores del stack local.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.feed.admin.${SUFIJO}@vivaguest.test`;
const PASSWORD_ADMIN = `feed-admin-${randomUUID()}`;

/** Una URL con la forma real: host de Airbnb y el `?s=` que es la parte secreta. */
const URL_ICAL = `https://www.airbnb.com/calendar/ical/${SUFIJO}.ics?s=SECRETO${SUFIJO}`;

/** Lo que el catálogo real tiene sembrado. Este archivo no toca ni una de esas filas. */
const SEMILLA_TOTAL = 39;

let uidAdmin = '';
let tokenAdmin = '';

const propiedadesCreadas: string[] = [];
const aseosCreados: string[] = [];

function servicio(): ClienteVivaGuest {
  return clienteAdminDePruebas();
}

function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function crearApartamento(): Promise<string> {
  const { data, error } = await clienteConToken(tokenAdmin)
    .from('properties')
    .insert({
      nombre: `Int Feed ${randomUUID().slice(0, 8)}`,
      cluster: 'Int Cluster Feed',
    })
    .select('id')
    .single();

  if (error) throw new Error(`No se pudo crear el apartamento de prueba: ${error.message}`);
  propiedadesCreadas.push(data.id);
  return data.id;
}

/** Cuenta filas SIN traerlas: `head: true` + `count: 'exact'`. */
async function contar(
  tabla: 'calendar_reservations' | 'cleanings' | 'calendar_feeds',
  propertyId: string,
): Promise<number> {
  const { count, error } = await servicio()
    .from(tabla)
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId);

  if (error) throw new Error(`No se pudo contar ${tabla}: ${error.message}`);
  return count ?? 0;
}

/** El feed que `registrarSaludDelFeed` crea, para colgarle las reservas centinela. */
async function idDelFeed(propertyId: string): Promise<string> {
  const { data, error } = await servicio()
    .from('calendar_feeds')
    .select('id')
    .eq('property_id', propertyId)
    .eq('provider', PROVEEDOR_AIRBNB)
    .single();

  if (error) throw new Error(`No se pudo leer el feed: ${error.message}`);
  return data.id;
}

async function sembrarReserva(feedId: string, propertyId: string, uid: string): Promise<string> {
  const { data, error } = await servicio()
    .from('calendar_reservations')
    .insert({
      feed_id: feedId,
      property_id: propertyId,
      uid,
      starts_on: '2026-09-03',
      ends_on: '2026-09-04',
      summary: 'Reserved',
      payload_hash: 'centinela',
    })
    .select('id')
    .single();

  if (error) throw new Error(`No se pudo sembrar la reserva centinela: ${error.message}`);
  return data.id;
}

/** La salud de un intento correcto, tal como la escribe `guardarFeed`. */
function saludCorrecta() {
  const ahora = new Date().toISOString();
  return {
    last_attempt_at: ahora,
    last_success_at: ahora,
    last_http_status: 200,
    last_event_count: 2,
    last_payload_hash: 'a'.repeat(64),
    last_error: null,
    consecutive_failures: 0,
  };
}

beforeAll(async () => {
  const { data, error } = await servicio().auth.admin.createUser({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin Del Feed' },
  });
  if (error) throw new Error(`No se pudo crear ${EMAIL_ADMIN}: ${error.message}`);
  uidAdmin = data.user.id;

  const sesion = await servicio().auth.signInWithPassword({
    email: EMAIL_ADMIN,
    password: PASSWORD_ADMIN,
  });
  if (sesion.error || !sesion.data.session) {
    throw new Error(`No se pudo iniciar sesión: ${sesion.error?.message}`);
  }
  tokenAdmin = sesion.data.session.access_token;
});

afterAll(async () => {
  const admin = servicio();

  // ORDEN OBLIGATORIO: `cleanings.property_id` es `on delete restrict`, así que
  // los aseos van antes que los apartamentos. `calendar_feeds`,
  // `calendar_reservations` y `property_secrets` caen solas por cascade.
  if (aseosCreados.length > 0) {
    await admin.from('cleanings').delete().in('id', aseosCreados);
  }
  if (propiedadesCreadas.length > 0) {
    await admin.from('properties').delete().in('id', propiedadesCreadas);
  }
  if (uidAdmin) await admin.auth.admin.deleteUser(uidAdmin);
});

// ════════════════════════════════════════════════════════════════════════════
// LA ASERCIÓN CENTRAL
// ════════════════════════════════════════════════════════════════════════════

describe('conectar un calendario no cruza la costura con la Fase 3', () => {
  test('CENTINELA + CONTROL: el contador ve las filas y se mueve cuando se escribe', async () => {
    const propertyId = await crearApartamento();

    // La fila de feed la crea la MISMA función que usa `guardarFeed`.
    const { error } = await registrarSaludDelFeed(
      clienteConToken(tokenAdmin),
      propertyId,
      saludCorrecta(),
    );
    expect(error).toBeNull();

    const feedId = await idDelFeed(propertyId);

    await sembrarReserva(feedId, propertyId, `centinela-1@airbnb.com`);

    const filaDeAseo = {
      property_id: propertyId,
      origin: 'ical',
      scheduled_date: hoyEnBogota(),
    } satisfies Partial<Database['public']['Tables']['cleanings']['Insert']>;

    const { data: aseo, error: errorAseo } = await servicio()
      .from('cleanings')
      .insert(filaDeAseo as Database['public']['Tables']['cleanings']['Insert'])
      .select('id')
      .single();
    expect(errorAseo).toBeNull();
    if (aseo) aseosCreados.push(aseo.id);

    // CENTINELA: las dos tablas NO están vacías. Sin esto, la igualdad de abajo
    // sería `0 === 0` y pasaría con el conteo roto.
    expect(await contar('calendar_reservations', propertyId)).toBe(1);
    expect(await contar('cleanings', propertyId)).toBe(1);

    // CONTROL DEL CONTADOR: se demuestra que SÍ detectaría una escritura.
    const idExtra = await sembrarReserva(feedId, propertyId, `centinela-2@airbnb.com`);
    expect(await contar('calendar_reservations', propertyId)).toBe(2);
    await servicio().from('calendar_reservations').delete().eq('id', idExtra);
    expect(await contar('calendar_reservations', propertyId)).toBe(1);
  });

  test('ANTES y DESPUÉS de conectar: los conteos son idénticos y NO son cero', async () => {
    const propertyId = await crearApartamento();

    // Estado de partida: feed creado + una reserva y un aseo centinela.
    await registrarSaludDelFeed(clienteConToken(tokenAdmin), propertyId, saludCorrecta());
    const feedId = await idDelFeed(propertyId);
    await sembrarReserva(feedId, propertyId, `antes-despues@airbnb.com`);

    const { data: aseo } = await servicio()
      .from('cleanings')
      .insert({
        property_id: propertyId,
        origin: 'ical',
        scheduled_date: hoyEnBogota(),
      } as Database['public']['Tables']['cleanings']['Insert'])
      .select('id')
      .single();
    if (aseo) aseosCreados.push(aseo.id);

    const reservasAntes = await contar('calendar_reservations', propertyId);
    const aseosAntes = await contar('cleanings', propertyId);

    // La igualdad solo significa algo si hay algo que contar.
    expect(reservasAntes).toBeGreaterThan(0);
    expect(aseosAntes).toBeGreaterThan(0);

    // ── CONECTAR: las dos escrituras que hace `guardarFeed`, en su orden ──────
    const { error: errorSecreto } = await servicio().from('property_secrets').upsert(
      { property_id: propertyId, ical_url: URL_ICAL, updated_by: uidAdmin },
      { onConflict: 'property_id' },
    );
    expect(errorSecreto).toBeNull();

    const { error: errorFeed } = await registrarSaludDelFeed(
      clienteConToken(tokenAdmin),
      propertyId,
      saludCorrecta(),
    );
    expect(errorFeed).toBeNull();

    // ── LA ASERCIÓN ──────────────────────────────────────────────────────────
    // VERIFICADA CONTRA UN SEÑUELO por la vía que de verdad puede romperla: se
    // añadió aquí, en este mismo bloque, un insert en `calendar_reservations`
    // con el cliente de SERVICIO —el que `guardarFeed` tiene a mano— y las dos
    // líneas de abajo se pusieron en rojo (`2` frente a `1`). El mismo insert
    // con el JWT del admin no las mueve, porque la base lo rechaza con 42501;
    // eso está medido en el test de la segunda capa, arriba.
    expect(await contar('calendar_reservations', propertyId)).toBe(reservasAntes);
    expect(await contar('cleanings', propertyId)).toBe(aseosAntes);
  });

  test('SEGUNDA CAPA, MEDIDA: el JWT del admin no puede insertar en calendar_reservations', async () => {
    // Descubierto atacando este mismo archivo con un señuelo. Se metió una
    // inserción en `calendar_reservations` DENTRO de `registrarSaludDelFeed`, y
    // los 10 tests siguieron en verde: la fila nunca llegó a escribirse porque
    // la migración 07 no le da INSERT sobre esa tabla a `authenticated`.
    //
    //   42501 permission denied for table calendar_reservations
    //   hint: GRANT INSERT ON public.calendar_reservations TO authenticated;
    //
    // Es una segunda capa que conviene tener escrita, con dos consecuencias:
    //   · un bleed de la Fase 3 hecho con el cliente del USUARIO no llega a la
    //     base aunque alguien lo escriba;
    //   · pero uno hecho con `createAdminClient()` SÍ llegaría, y esa fábrica
    //     está a la vista dentro de `guardarFeed`. Por eso el conteo
    //     antes-después sigue siendo la aserción que importa: es la única que
    //     cubre la ruta privilegiada.
    const propertyId = await crearApartamento();
    await registrarSaludDelFeed(clienteConToken(tokenAdmin), propertyId, saludCorrecta());
    const feedId = await idDelFeed(propertyId);

    const { error } = await clienteConToken(tokenAdmin).from('calendar_reservations').insert({
      feed_id: feedId,
      property_id: propertyId,
      uid: `no-deberia@airbnb.com`,
      starts_on: '2026-10-01',
      ends_on: '2026-10-02',
      payload_hash: 'no-deberia',
    });

    expect(error?.code).toBe('42501');
    expect(await contar('calendar_reservations', propertyId)).toBe(0);
  });

  test('el archivo de actions no nombra las tablas de la Fase 3', () => {
    // Guardarraíl barato y estático que corre sin base: la costura también se
    // rompe escribiendo el `from('cleanings')` que hoy no está.
    const ruta = resolve(
      process.cwd(),
      'app/(admin)/apartamentos/[id]/calendario/_actions.ts',
    );
    const codigo = readFileSync(ruta, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');

    // CONTROL: el filtro de comentarios no vació el archivo.
    expect(codigo).toContain('registrarSaludDelFeed');

    expect(codigo).not.toContain('calendar_reservations');
    expect(codigo).not.toMatch(/from\(\s*['"]cleanings['"]/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LAS DOS RUTAS DE ESCRITURA
// ════════════════════════════════════════════════════════════════════════════

describe('la URL va a property_secrets y solo se alcanza con el cliente de servicio', () => {
  test('queda escrita, y el mismo select con el JWT del admin da 42501', async () => {
    const propertyId = await crearApartamento();

    await servicio()
      .from('property_secrets')
      .upsert({ property_id: propertyId, ical_url: URL_ICAL }, { onConflict: 'property_id' });

    // CONTROL: con el cliente que sí puede, la fila existe y trae la URL entera.
    const { data, error } = await servicio()
      .from('property_secrets')
      .select('ical_url')
      .eq('property_id', propertyId)
      .single();
    expect(error).toBeNull();
    expect(data?.ical_url).toBe(URL_ICAL);

    // Y la aserción: no es "cero filas", es que no hay privilegio de tabla.
    const negado = await clienteConToken(tokenAdmin)
      .from('property_secrets')
      .select('ical_url')
      .eq('property_id', propertyId);

    expect(negado.error?.code).toBe('42501');
    expect(negado.data).toBeNull();
  });
});

describe('calendar_feeds guarda la salud, y solo la salud', () => {
  test('el admin SÍ puede escribirla con su propio JWT', async () => {
    const propertyId = await crearApartamento();

    const { error } = await registrarSaludDelFeed(
      clienteConToken(tokenAdmin),
      propertyId,
      saludCorrecta(),
    );
    expect(error).toBeNull();

    const feed = await leerFeedDeApartamento(clienteConToken(tokenAdmin), propertyId);

    expect(feed).not.toBeNull();
    expect(feed?.last_success_at).not.toBeNull();
    expect(feed?.last_http_status).toBe(200);
    expect(feed?.last_event_count).toBe(2);
    expect(feed?.last_error).toBeNull();
    expect(feed?.consecutive_failures).toBe(0);
  });

  test('validar dos veces ACTUALIZA la fila, no la duplica', async () => {
    const propertyId = await crearApartamento();
    const cliente = clienteConToken(tokenAdmin);

    await registrarSaludDelFeed(cliente, propertyId, saludCorrecta());
    expect(await contar('calendar_feeds', propertyId)).toBe(1);

    // Segunda validación del mismo apartamento y proveedor.
    await registrarSaludDelFeed(cliente, propertyId, { ...saludCorrecta(), last_event_count: 7 });

    // `calendar_feeds_prop_provider_uniq` hace el upsert por (property_id, provider).
    expect(await contar('calendar_feeds', propertyId)).toBe(1);

    const feed = await leerFeedDeApartamento(cliente, propertyId);
    expect(feed?.last_event_count).toBe(7);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA URL ES UNA CREDENCIAL: NO ENTRA EN NINGUNA COLUMNA DE DIAGNÓSTICO
// ════════════════════════════════════════════════════════════════════════════

describe('last_error nunca lleva la URL (T-02-73)', () => {
  /** Busca la parte secreta de la URL en TODAS las columnas de texto de la fila. */
  function laFilaFiltraLaUrl(fila: Record<string, unknown>): boolean {
    return Object.values(fila).some(
      (v) => typeof v === 'string' && (v.includes(URL_ICAL) || v.includes(`SECRETO${SUFIJO}`)),
    );
  }

  test('CONTROL: el escáner SÍ detecta la fuga cuando la fuga existe', async () => {
    const propertyId = await crearApartamento();
    const cliente = clienteConToken(tokenAdmin);
    await registrarSaludDelFeed(cliente, propertyId, saludCorrecta());

    // Se provoca la fuga a mano, escribiendo la URL donde no debe ir. Sin este
    // control, el `false` de abajo pasaría también con un escáner que no mira
    // ninguna columna.
    await cliente
      .from('calendar_feeds')
      .update({ last_error: `fallo al leer ${URL_ICAL}` })
      .eq('property_id', propertyId);

    const { data } = await servicio()
      .from('calendar_feeds')
      .select('*')
      .eq('property_id', propertyId)
      .single();

    expect(laFilaFiltraLaUrl(data as Record<string, unknown>)).toBe(true);
  });

  test('un intento fallido deja el motivo y el status, y ni un carácter de la URL', async () => {
    const propertyId = await crearApartamento();
    const cliente = clienteConToken(tokenAdmin);
    await registrarSaludDelFeed(cliente, propertyId, saludCorrecta());

    // El camino real de un fallo: `resumirFallo` produce el texto y
    // `actualizarSaludSiExiste` lo escribe. Ninguna de las dos recibe la URL.
    const tocada = await actualizarSaludSiExiste(cliente, propertyId, {
      last_attempt_at: new Date().toISOString(),
      last_success_at: null,
      last_http_status: 404,
      last_event_count: null,
      last_payload_hash: null,
      last_error: resumirFallo('no-encontrado', 404),
      consecutive_failures: 1,
    });
    expect(tocada).toBe(true);

    const { data } = await servicio()
      .from('calendar_feeds')
      .select('*')
      .eq('property_id', propertyId)
      .single();

    const fila = data as Record<string, unknown>;

    // CONTROL: el diagnóstico sí quedó escrito. Una fila con `last_error` nulo
    // pasaría el `false` de abajo sin decir nada.
    expect(fila.last_error).toContain('404');
    expect(fila.last_error).toContain('no-encontrado');

    expect(laFilaFiltraLaUrl(fila)).toBe(false);
  });

  test('`actualizarSaludSiExiste` no CREA la fila cuando el feed no existe', async () => {
    // Validar un link todavía no guardado no debe hacer que el apartamento
    // aparezca con calendario conectado en la lista (columna 7 de §7.1).
    const propertyId = await crearApartamento();

    const tocada = await actualizarSaludSiExiste(clienteConToken(tokenAdmin), propertyId, {
      last_attempt_at: new Date().toISOString(),
      last_success_at: null,
      last_http_status: 404,
      last_event_count: null,
      last_payload_hash: null,
      last_error: resumirFallo('no-encontrado', 404),
      consecutive_failures: 1,
    });

    expect(tocada).toBe(false);
    expect(await contar('calendar_feeds', propertyId)).toBe(0);
  });
});

describe('la semilla del catálogo queda intacta', () => {
  test('siguen siendo 39 apartamentos más los que creó este archivo', async () => {
    const { count, error } = await servicio()
      .from('properties')
      .select('id', { count: 'exact', head: true });

    expect(error).toBeNull();
    expect(count).toBe(SEMILLA_TOTAL + propiedadesCreadas.length);
  });
});
