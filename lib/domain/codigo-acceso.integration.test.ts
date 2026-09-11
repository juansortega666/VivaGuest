import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Database } from '@/lib/database.types';
import {
  limpiarAseos,
  sembrarEscenarioDeAseos,
  sumarDias,
  type EscenarioDeAseos,
} from '@/lib/test/aseos';
import { clienteAdminDePruebas, clienteConToken } from '@/lib/test/clientes';

/**
 * EL CONTRATO DEL SECRETO AUDITADO, CONTRA POSTGRES REAL Y CON JWT REALES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE MIDE ESTE ARCHIVO Y NINGUNA PRUEBA CON DOBLES PUEDE MEDIR.
 *
 * `app/(cleaner)/aseos/[id]/_actions.test.ts` prueba la FORMA: que el guard vaya
 * primero, que al RPC solo viaje el identificador del aseo y que los tres casos
 * de denegacion devuelvan la misma cadena. Nada de eso dice si Postgres de
 * verdad deniega, ni si revelar de verdad deja rastro.
 *
 * Aqui se mide lo unico que importa del producto en esta superficie:
 *
 *   T-01-48  no puede existir lectura de codigo sin una fila de auditoria
 *   T-05-46  la unica ruta al codigo es el RPC, y el RPC audita
 *   T-05-47  la tabla de credenciales es inalcanzable: `42501`, no cero filas
 *   T-05-48  fuera de la ventana hoy..manana no entrega, y tampoco audita
 *   T-05-45  la denegacion por fecha y la denegacion por dueno son el MISMO error
 *
 * ── POR QUE LA SEGUNDA MITAD DE T-05-48 IMPORTA TANTO COMO LA PRIMERA ──────
 *
 * Que fuera de la ventana el RPC no entregue nada es lo obvio. Que ADEMAS no
 * escriba rastro es lo que lo vuelve util: si escribiera una fila por cada
 * intento denegado, la bitacora de "quien vio que codigo" se llenaria de ruido y
 * dejaria de servir para lo que existe, que es responder esa pregunta el dia que
 * roben un apartamento.
 *
 * ── POR QUE HAY QUE REPONER LA CONTRASENA DEL ASEADOR ──────────────────────
 *
 * `sembrarEscenarioDeAseos()` crea a sus tres aseadoras con una contrasena
 * aleatoria que NO devuelve, asi que no hay forma de iniciar sesion como ellas.
 * Se les repone una conocida con el cliente de servicio y solo despues se inicia
 * sesion de verdad contra GoTrue: el token que sale de ahi es el que viaja en
 * todas las aserciones, asi que la RLS y las guardas del RPC actuan igual que en
 * produccion. Lo unico simulado es de donde sale la contrasena.
 *
 * Requiere `npx supabase start` y `.env.local`.
 * ════════════════════════════════════════════════════════════════════════════
 */

const PASSWORD = `codigo-${randomUUID()}`;

/** El codigo sembrado. Seis digitos, como los de una cerradura de verdad. */
const CODIGO = '482917';

let escenario: EscenarioDeAseos;
let tokenA = '';
let tokenB = '';
/** El aseo cancelado que SI tiene aseadora, sembrado por este archivo. */
let aseoCanceladoPropio = '';

function servicio() {
  return clienteAdminDePruebas();
}

/**
 * Le repone la contrasena a un usuario ya sembrado y devuelve su `access_token`.
 *
 * El `signInWithPassword` va contra GoTrue de verdad: el token resultante lleva
 * los claims reales, incluido el `sub` que leen `auth.uid()` y las seis funciones
 * de `private`.
 */
async function tokenDe(uid: string): Promise<string> {
  const admin = servicio();

  const { data: actualizado, error: errorUpdate } = await admin.auth.admin.updateUserById(uid, {
    password: PASSWORD,
  });
  if (errorUpdate || !actualizado.user?.email) {
    throw new Error(`No se pudo reponer la contrasena de ${uid}: ${errorUpdate?.message}`);
  }

  const { data, error } = await admin.auth.signInWithPassword({
    email: actualizado.user.email,
    password: PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesion como ${uid}: ${error?.message}`);
  }

  return data.session.access_token;
}

/** Cuantas lecturas hay registradas sobre un apartamento. */
async function rastrosDe(propertyId: string): Promise<number> {
  const { count, error } = await servicio()
    .from('access_code_reads')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId);

  if (error) throw new Error(`No se pudo contar la bitacora: ${error.message}`);
  return count ?? 0;
}

/** Llama al RPC con el JWT que se le pase, que es el punto de todo el archivo. */
async function revelar(token: string, aseo: string) {
  return clienteConToken(token).rpc('reveal_access_code', { p_cleaning: aseo });
}

beforeAll(async () => {
  escenario = await sembrarEscenarioDeAseos();
  const admin = servicio();

  // El codigo de la cerradura. La tabla no tiene grant para `authenticated`, asi
  // que sembrarla exige el cliente de servicio; es la misma excepcion acotada
  // que documenta `lib/test/aseos.ts`.
  const { error: errorSecreto } = await admin.from('property_secrets').upsert({
    property_id: escenario.aptoGestionado,
    codigo_acceso: CODIGO,
    tipo_cerradura: 'inteligente',
    notas_acceso: 'La cerradura está a la derecha de la puerta.',
  });
  if (errorSecreto) throw new Error(`No se pudo sembrar el codigo: ${errorSecreto.message}`);

  // Un aseo CANCELADO que conserva a la aseadora A. El escenario compartido trae
  // uno cancelado, pero sin `aseador_id`: con ese, la denegacion vendria de no
  // ser suyo y no de estar cancelado, que es otra medicion. El indice unico
  // `(property_id, scheduled_date)` es PARCIAL y excluye lo cancelado, asi que
  // puede compartir el dia de hoy con el aseo en curso.
  const filaCancelada = {
    property_id: escenario.aptoGestionado,
    origin: 'ical',
    state: 'cancelada',
    scheduled_date: escenario.fechas.hoy,
    aseador_id: escenario.aseadorA,
    confirmado_at: new Date().toISOString(),
    cancelled_at: new Date().toISOString(),
    cancel_reason: 'reserva_desaparecida',
  } satisfies Partial<Database['public']['Tables']['cleanings']['Insert']>;

  const { data: cancelada, error: errorCancelada } = await admin
    .from('cleanings')
    .insert(filaCancelada as Database['public']['Tables']['cleanings']['Insert'])
    .select('id')
    .single();
  if (errorCancelada || !cancelada) {
    throw new Error(`No se pudo sembrar el aseo cancelado: ${errorCancelada?.message}`);
  }
  aseoCanceladoPropio = cancelada.id;

  tokenA = await tokenDe(escenario.aseadorA);
  tokenB = await tokenDe(escenario.aseadorB);
});

afterAll(async () => {
  // La bitacora no cae por cascade desde el aseo (`on delete set null`, a
  // proposito: el rastro sobrevive a la purga). Si cae desde el apartamento,
  // pero se borra explicito para no dejar nada de este archivo en la base.
  await servicio().from('access_code_reads').delete().eq('property_id', escenario.aptoGestionado);
  await servicio().from('property_secrets').delete().eq('property_id', escenario.aptoGestionado);
  await limpiarAseos();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. REVELAR DEJA RASTRO — T-01-48 MEDIDO DESDE LA SUPERFICIE NUEVA
// ════════════════════════════════════════════════════════════════════════════

describe('revelar el codigo de un aseo de hoy', () => {
  test('entrega el codigo y deja EXACTAMENTE una fila nueva en la bitacora', async () => {
    const antes = await rastrosDe(escenario.aptoGestionado);

    const { data, error } = await revelar(tokenA, escenario.aseoEnCurso);

    expect(error).toBeNull();
    expect(data?.[0]?.codigo_acceso).toBe(CODIGO);

    const despues = await rastrosDe(escenario.aptoGestionado);
    expect(despues - antes).toBe(1);
  });

  test('la fila de la bitacora dice QUIEN, QUE aseo y CUANDO', async () => {
    // Sin estos tres campos la bitacora no responde la pregunta para la que
    // existe. `read_at` lo pone un `default now()`, asi que se comprueba que
    // llego y no un valor concreto.
    const { data, error } = await servicio()
      .from('access_code_reads')
      .select('read_by, cleaning_id, read_at')
      .eq('cleaning_id', escenario.aseoEnCurso)
      .order('read_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.read_by).toBe(escenario.aseadorA);
    expect(data?.cleaning_id).toBe(escenario.aseoEnCurso);
    expect(data?.read_at).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. FUERA DE LA VENTANA: NI CODIGO NI RASTRO — T-05-48
// ════════════════════════════════════════════════════════════════════════════

describe('la ventana temporal', () => {
  test('el MISMO aseo, movido a pasado manana, no entrega nada y no deja rastro', async () => {
    // Se mueve el aseo y se devuelve a su sitio: la fecha es la UNICA variable
    // que cambia entre este caso y el anterior, que es lo que lo convierte en
    // una medicion de la ventana y no de otra cosa.
    const pasadoManana = sumarDias(escenario.fechas.hoy, 2);

    const { error: errorMover } = await servicio()
      .from('cleanings')
      .update({ scheduled_date: pasadoManana })
      .eq('id', escenario.aseoEnCurso);
    expect(errorMover).toBeNull();

    try {
      const antes = await rastrosDe(escenario.aptoGestionado);

      const { data, error } = await revelar(tokenA, escenario.aseoEnCurso);

      expect(data).toBeNull();
      expect(error?.code).toBe('42501');

      const despues = await rastrosDe(escenario.aptoGestionado);
      expect(despues).toBe(antes);
    } finally {
      await servicio()
        .from('cleanings')
        .update({ scheduled_date: escenario.fechas.hoy })
        .eq('id', escenario.aseoEnCurso);
    }
  });

  test('un aseo propio a tres dias tampoco: visible no es lo mismo que desbloqueable', async () => {
    // `private.my_property_ids()` llega a hoy+7 y `my_unlockable_property_ids()`
    // solo a hoy+1. Este aseo esta dentro de la primera y fuera de la segunda:
    // el aseador lo VE y no puede abrir la puerta. Es la pareja de aserciones 3 y
    // 13 de `00_rls_aseos.test.sql`, medida desde esta superficie.
    const antes = await rastrosDe(escenario.aptoGestionado);

    const { data, error } = await revelar(tokenA, escenario.aseoPendiente);

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(await rastrosDe(escenario.aptoGestionado)).toBe(antes);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. LOS OTROS DOS CASOS DE DENEGACION, Y QUE SON INDISTINGUIBLES — T-05-45
// ════════════════════════════════════════════════════════════════════════════

describe('las otras denegaciones', () => {
  test('otra aseadora sobre el mismo aseo no entrega nada y no deja rastro', async () => {
    const antes = await rastrosDe(escenario.aptoGestionado);

    const { data, error } = await revelar(tokenB, escenario.aseoEnCurso);

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(await rastrosDe(escenario.aptoGestionado)).toBe(antes);
  });

  test('un aseo cancelado propio no entrega nada', async () => {
    const { data, error } = await revelar(tokenA, aseoCanceladoPropio);

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });

  test('un aseo inexistente no entrega nada', async () => {
    const { data, error } = await revelar(tokenA, randomUUID());

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });

  test('los CUATRO casos son indistinguibles desde el cliente', async () => {
    // La asercion que cierra el oraculo de enumeracion: si alguno de los cuatro
    // trajera otro codigo, otro mensaje u otro `hint`, un aseador podria barrer
    // identificadores y deducir por la forma del error cuales son trabajos reales
    // de otras personas y cuales no existen.
    const respuestas = await Promise.all([
      revelar(tokenA, randomUUID()), //           no existe
      revelar(tokenB, escenario.aseoEnCurso), //  no es tuyo
      revelar(tokenA, escenario.aseoPendiente), // todavia no es su dia
      revelar(tokenA, aseoCanceladoPropio), //     ya no esta vivo
    ]);

    const huellas = respuestas.map((r) =>
      JSON.stringify({
        code: r.error?.code,
        message: r.error?.message,
        hint: r.error?.hint,
        details: r.error?.details,
      }),
    );

    expect(new Set(huellas).size).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. LA OTRA PUERTA NO EXISTE — T-05-47
// ════════════════════════════════════════════════════════════════════════════

describe('la tabla de credenciales', () => {
  test('una lectura directa con el JWT del aseador falla con 42501, NO con cero filas', async () => {
    // La distincion es la que importa. Cero filas significaria que la tabla es
    // alcanzable y que lo unico que la protege es una policy: ese dia, un error
    // en la policy la abre. `42501` significa que NO HAY GRANT, o sea que es
    // inalcanzable por construccion y que el grant tendria que anadirse a mano
    // para abrirla. Es el invariante de la Fase 1, reafirmado desde la primera
    // pantalla que tiene un motivo para intentarlo.
    const { data, error } = await clienteConToken(tokenA)
      .from('property_secrets')
      .select('codigo_acceso')
      .eq('property_id', escenario.aptoGestionado);

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  test('tampoco por embed desde el apartamento', async () => {
    // PostgREST resuelve el embed con el MISMO rol, asi que la ausencia de grant
    // tambien lo tumba. Se comprueba porque es la forma en que alguien lo
    // intentaria "sin querer": anadiendo un campo mas a un select que ya existe.
    const { error } = await clienteConToken(tokenA)
      .from('properties')
      .select('id, property_secrets(codigo_acceso)')
      .eq('id', escenario.aptoGestionado);

    expect(error).not.toBeNull();
  });
});
