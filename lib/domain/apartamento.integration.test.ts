import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Database } from '@/lib/database.types';
import { mapDbError } from '@/lib/domain/errors';
import { clienteAdminDePruebas, clienteConToken, type ClienteVivaGuest } from '@/lib/test/clientes';

/**
 * LAS DOS FRONTERAS DEL CATÁLOGO, CONTRA LA BASE REAL Y CON JWT REALES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Ni un test unitario ni Playwright pueden dar estas aserciones. El unitario
 * stubbea el cliente y solo comprueba que el stub devuelve lo que el stub
 * devuelve; Playwright ve la pantalla y no el SQLSTATE. Lo que se mide aquí es
 * qué deja hacer la base a cada rol, emitiendo cada consulta con el token de
 * quien la haría.
 *
 * FRONTERA 1: los secretos del apartamento son INALCANZABLES con un JWT de
 * usuario, incluso siendo admin. No por RLS: por ausencia de grant.
 *
 * FRONTERA 2: la base es la RED DE SEGURIDAD de la activación. Las puertas
 * viven en `apartamento.schema.ts`, y si alguien las evade por API directa hay
 * un 23514 detrás… salvo en un caso, que este archivo también deja escrito.
 *
 * REGLA DE ESTE ARCHIVO, HEREDADA DEL PLAN 02-09 Y PAGADA ALLÍ:
 * TODA aserción que espere "vacío", "0 filas" o "denegado" lleva delante una
 * aserción de CONTROL que demuestra que la cosa existía. Sin ella, el verde lo
 * da igual un fixture que nunca se sembró. En el 02-09, un señuelo que quitó el
 * sembrado dejó la aserción central VERDE (0 filas antes y 0 después) y solo el
 * CONTROL se cayó.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este archivo NO invoca las Server Actions de
 * `app/(admin)/apartamentos/_actions.ts`: una action arrastra `next/cache` y el
 * almacén de cookies de una petición, que fuera de Next no existen (misma razón
 * que documentan `alta-aseador.integration.test.ts` y
 * `revocacion.integration.test.ts`). Lo que se mide es la capa que la action
 * delega, operación por operación, con el mismo cliente que ella usa para cada
 * tabla. Que la action de verdad use el cliente correcto lo garantiza el
 * guardarraíl 7 de CI más la revisión del propio archivo.
 *
 * Requiere `npx supabase start` y `.env.local` con los valores del stack local.
 */

const SUFIJO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `int.apto.admin.${SUFIJO}@vivaguest.test`;
const EMAIL_ASEADOR = `int.apto.aseador.${SUFIJO}@vivaguest.test`;
const PASSWORD_ADMIN = `apto-admin-${randomUUID()}`;
const PASSWORD_ASEADOR = `apto-aseador-${randomUUID()}`;

/** Lo que el catálogo real tiene sembrado. No se toca ni una de estas filas. */
const SEMILLA_TOTAL = 39;
const SEMILLA_INFORMATIVAS = 5;
const SEMILLA_CLUSTERS = 8;

let uidAdmin = '';
let uidAseador = '';
let tokenAdmin = '';
let tokenAseador = '';

/** Todo lo que este archivo crea y tiene que borrar. */
const propiedadesCreadas: string[] = [];
const aseosCreados: string[] = [];

/** `today_bog()`: Bogotá es UTC-5 fijo, sin DST. La suite corre con TZ=UTC. */
function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function servicio(): ClienteVivaGuest {
  return clienteAdminDePruebas();
}

async function crearUsuario(
  email: string,
  password: string,
  rol: 'admin' | 'aseador',
  nombre: string,
): Promise<string> {
  const { data, error } = await servicio().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // El rol va en los DOS sitios: `app_metadata` es lo que viaja en el JWT y lee
    // `private.is_admin()` vía `profiles`; `user_metadata` es lo que lee
    // `tg_handle_new_user` para materializar la fila de `public.profiles`.
    app_metadata: { role: rol },
    user_metadata: { role: rol, full_name: nombre },
  });
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`);
  return data.user.id;
}

async function iniciarSesion(email: string, password: string): Promise<string> {
  const { data, error } = await servicio().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

/**
 * Crea un apartamento con el JWT DEL ADMIN, no con el cliente de servicio.
 *
 * Sembrar con el cliente que salta la RLS y comprobar con otro es lo correcto
 * para un fixture ajeno, pero aquí el hecho que interesa es justamente que el
 * admin PUEDE escribir `properties` con su propio token: es la otra mitad de la
 * frontera 1 y hacerlo por la vía privilegiada la escondería. LA ESCRITURA SIGUE
 * SIENDO SUYA, y si un día dejara de poder escribir, este helper revienta.
 *
 * ── POR QUÉ LA REPRESENTACIÓN DE VUELTA YA NO ES UN COMODÍN (migración 24) ──
 *
 * Este helper pedía `select('*')` tras el insert. La migración 24 sacó
 * `tarifa_huesped` y `pago_aseador` del grant de columna de `authenticated` para
 * cerrar la fuga de D7-7, y en Postgres el asterisco de un RETURNING exige
 * privilegio sobre TODAS las columnas: el insert funcionaba y la LECTURA DE
 * VUELTA daba `42501 permission denied for table properties`. Es el caso
 * silencioso que el plan 07-05 fue a buscar: un error de permiso en una
 * operación que parecía de escritura.
 *
 * La escritura se queda con el token del admin y solo devuelve `id`; la fila
 * completa —que este archivo necesita entera, incluidas las dos cifras— la lee
 * el cliente de servicio, que conserva su grant de tabla. Lo que el helper
 * DEMUESTRA no cambia: el admin escribió.
 */
async function crearApartamento(
  campos: Partial<Database['public']['Tables']['properties']['Insert']> = {},
): Promise<Database['public']['Tables']['properties']['Row']> {
  const { data, error } = await clienteConToken(tokenAdmin)
    .from('properties')
    .insert({
      // `properties_nombre_uniq` es un índice único: el nombre lleva sufijo
      // aleatorio para que dos corridas seguidas no choquen entre sí.
      nombre: `Int Apto ${randomUUID().slice(0, 8)}`,
      cluster: 'Int Cluster',
      ...campos,
    })
    .select('id')
    .single();

  if (error) throw new Error(`No se pudo crear el apartamento de prueba: ${error.message}`);
  propiedadesCreadas.push(data.id);

  const { data: fila, error: errorLectura } = await servicio()
    .from('properties')
    .select('*')
    .eq('id', data.id)
    .single();

  if (errorLectura) {
    throw new Error(`No se pudo releer el apartamento de prueba: ${errorLectura.message}`);
  }

  return fila;
}

beforeAll(async () => {
  uidAdmin = await crearUsuario(EMAIL_ADMIN, PASSWORD_ADMIN, 'admin', 'Admin Del Catalogo');
  uidAseador = await crearUsuario(EMAIL_ASEADOR, PASSWORD_ASEADOR, 'aseador', 'Aseadora Del Catalogo');

  tokenAdmin = await iniciarSesion(EMAIL_ADMIN, PASSWORD_ADMIN);
  tokenAseador = await iniciarSesion(EMAIL_ASEADOR, PASSWORD_ASEADOR);
});

afterAll(async () => {
  const admin = servicio();

  // ORDEN OBLIGATORIO. `cleanings.aseador_id` es `on delete restrict`: con un
  // aseo en pie, borrar al usuario falla y deja basura en un stack local que es
  // COMPARTIDO entre worktrees. Y `properties.responsable_id` también es
  // `restrict`, así que los apartamentos van antes que los perfiles.
  // `property_secrets` cae sola: su FK es `on delete cascade`.
  if (aseosCreados.length > 0) {
    await admin.from('cleanings').delete().in('id', aseosCreados);
  }
  if (propiedadesCreadas.length > 0) {
    await admin.from('properties').delete().in('id', propiedadesCreadas);
  }
  for (const uid of [uidAdmin, uidAseador]) {
    if (uid) await admin.auth.admin.deleteUser(uid);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// FRONTERA 1 — los secretos son inalcanzables con un JWT de usuario
// ════════════════════════════════════════════════════════════════════════════

describe('property_secrets no tiene grant: la policy secrets_admin_all es inalcanzable', () => {
  test('CONTROL: con el cliente de servicio la fila EXISTE y se lee entera', async () => {
    // Sin este control, los tres 42501 de abajo pasarían igual sobre una tabla
    // vacía, y no dirían nada sobre el grant.
    const apartamento = await crearApartamento();

    const { error: errorEscritura } = await servicio().from('property_secrets').upsert(
      {
        property_id: apartamento.id,
        tipo_cerradura: 'llave_fisica',
        codigo_acceso: 'CONTROL-4821',
        notas_acceso: 'La reja de afuera va con llave.',
        ical_url: 'https://www.airbnb.com/calendar/ical/control.ics',
        updated_by: uidAdmin,
      },
      { onConflict: 'property_id' },
    );
    expect(errorEscritura).toBeNull();

    const { data, error } = await servicio()
      .from('property_secrets')
      .select('*')
      .eq('property_id', apartamento.id)
      .single();

    expect(error).toBeNull();
    expect(data?.codigo_acceso).toBe('CONTROL-4821');
    expect(data?.ical_url).toBe('https://www.airbnb.com/calendar/ical/control.ics');
  });

  test('el ADMIN, con su propio JWT, recibe 42501 al hacer SELECT', async () => {
    const { data, error } = await clienteConToken(tokenAdmin)
      .from('property_secrets')
      .select('codigo_acceso, ical_url');

    // NO es "cero filas": es que no tiene privilegio de tabla. La distinción
    // importa porque un `[]` podría venir de una policy que no casa, que es una
    // protección mucho más frágil que la ausencia de grant.
    expect(error?.code).toBe('42501');
    expect(error?.message).toContain('permission denied');
    expect(data).toBeNull();
  });

  test('el ADMIN, con su propio JWT, recibe 42501 al hacer UPSERT', async () => {
    const apartamento = await crearApartamento();

    const { error } = await clienteConToken(tokenAdmin).from('property_secrets').upsert(
      {
        property_id: apartamento.id,
        tipo_cerradura: 'inteligente',
        codigo_acceso: 'NO-DEBERIA-ENTRAR',
      },
      { onConflict: 'property_id' },
    );

    expect(error?.code).toBe('42501');

    // Y la escritura no ocurrió por ninguna otra vía: se comprueba con el
    // cliente que SÍ puede mirar.
    const { data } = await servicio()
      .from('property_secrets')
      .select('codigo_acceso')
      .eq('property_id', apartamento.id)
      .maybeSingle();

    expect(data).toBeNull();
  });

  test('un ASEADOR tampoco alcanza property_secrets: 42501', async () => {
    const { error } = await clienteConToken(tokenAseador)
      .from('property_secrets')
      .select('codigo_acceso');

    expect(error?.code).toBe('42501');
  });

  test('el embed de PostgREST desde properties tampoco lo alcanza', async () => {
    // T-02-49 afirma que no hay embed que llegue al código de la cerradura. Es
    // una afirmación comprobable, así que se comprueba en vez de creerla: un
    // embed es exactamente la ruta por la que una columna "protegida por
    // policy" se escapa cuando el grant sí existe.
    const { data, error } = await clienteConToken(tokenAdmin)
      .from('properties')
      .select('id, property_secrets(codigo_acceso)')
      .limit(1);

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe('la RLS de properties para un aseador', () => {
  test('CONTROL + aserción: solo ve los apartamentos con aseo vivo, no las 39', async () => {
    const apartamento = await crearApartamento({
      gestion_vivaguest: true,
      responsable_id: uidAseador,
    });

    // ANTES de sembrar el aseo: ser responsable NO da acceso de lectura.
    // `properties_cleaner_select` acota por `private.my_property_ids()`, que sale
    // de `cleanings`, no de `properties.responsable_id`.
    const { data: antes, error: errorAntes } = await clienteConToken(tokenAseador)
      .from('properties')
      .select('id');

    expect(errorAntes).toBeNull();
    expect(antes).toHaveLength(0);

    // `is_managed`, `hora_limite` y `state` los rellena `tg_cleanings_snapshot()`
    // (BEFORE INSERT). No se pasan a mano: sería inventar el snapshot que el
    // trigger existe para calcular. El cast acota el hueco de que `supabase gen
    // types` sale del DDL y no ve los triggers BEFORE.
    const filaDeAseo = {
      property_id: apartamento.id,
      origin: 'manual',
      scheduled_date: hoyEnBogota(),
      aseador_id: uidAseador,
    } satisfies Partial<Database['public']['Tables']['cleanings']['Insert']>;

    const { data: aseo, error: errorAseo } = await servicio()
      .from('cleanings')
      .insert(filaDeAseo as Database['public']['Tables']['cleanings']['Insert'])
      .select('id')
      .single();

    expect(errorAseo).toBeNull();
    if (aseo) aseosCreados.push(aseo.id);

    // DESPUÉS: ve exactamente uno, y es el suyo. Las 39 sembradas siguen fuera
    // de su alcance, que es la mitad que un `toHaveLength(0)` nunca demuestra.
    const { data: despues, error: errorDespues } = await clienteConToken(tokenAseador)
      .from('properties')
      .select('id');

    expect(errorDespues).toBeNull();
    expect(despues).toHaveLength(1);
    expect(despues?.[0].id).toBe(apartamento.id);
  });

  test('CONTROL + aserción: su UPDATE afecta 0 filas y NO da error', async () => {
    const apartamento = await crearApartamento();

    const { data: comoAseador, error: errorAseador } = await clienteConToken(tokenAseador)
      .from('properties')
      .update({ nombre: 'Secuestrado por el aseador' })
      .eq('id', apartamento.id)
      .select('id');

    // Sin error: tiene el GRANT sobre `properties`. Lo que no tiene es una fila
    // que case con `properties_admin_all`, así que no hay nada que actualizar.
    // Un `42501` aquí sería otra cosa, y una protección distinta.
    expect(errorAseador).toBeNull();
    expect(comoAseador).toHaveLength(0);

    // CONTROL, y no es decorativo: sin él, "0 filas" lo daría igual un id que no
    // existe o un nombre de columna mal escrito. El MISMO update, con el MISMO
    // id, emitido por el admin, afecta 1 fila.
    const { data: comoAdmin, error: errorAdmin } = await clienteConToken(tokenAdmin)
      .from('properties')
      .update({ nombre: `Int Apto renombrado ${randomUUID().slice(0, 8)}` })
      .eq('id', apartamento.id)
      .select('id');

    expect(errorAdmin).toBeNull();
    expect(comoAdmin).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FRONTERA 2 — la base es la red de seguridad de la activación
// ════════════════════════════════════════════════════════════════════════════

describe('las puertas de activación de properties', () => {
  test('activar por API directa una gestionada sin tarifas ni responsable da 23514', async () => {
    const apartamento = await crearApartamento({ gestion_vivaguest: true });

    // CONTROL: la fila nació inactiva y sin tarifas. Si el fixture llegara ya
    // completo, el update de abajo pasaría y el test no probaría nada.
    expect(apartamento.is_active).toBe(false);
    expect(apartamento.tarifa_huesped).toBeNull();
    expect(apartamento.pago_aseador).toBeNull();
    expect(apartamento.responsable_id).toBeNull();

    const { error } = await clienteConToken(tokenAdmin)
      .from('properties')
      .update({ is_active: true })
      .eq('id', apartamento.id)
      .select('id');

    // SE ASSERTEA EL SQLSTATE Y NO EL NOMBRE DEL CONSTRAINT. Postgres no
    // garantiza el orden de evaluación de los CHECK: el research midió que
    // dispara `props_active_requires_owner` y no `props_active_requires_rates`,
    // aunque las dos condiciones se violan. Cualquier lógica que dependa de
    // CUÁL falla es frágil por construcción.
    expect(error?.code).toBe('23514');

    // Y no se activó.
    const { data } = await servicio()
      .from('properties')
      .select('is_active')
      .eq('id', apartamento.id)
      .single();

    expect(data?.is_active).toBe(false);
  });

  test('mapDbError traduce ese error al español, sin texto crudo de Postgres', async () => {
    const apartamento = await crearApartamento({ gestion_vivaguest: true });

    const { error } = await clienteConToken(tokenAdmin)
      .from('properties')
      .update({ is_active: true })
      .eq('id', apartamento.id)
      .select('id');

    expect(error).not.toBeNull();

    // CONTROL de que el mensaje crudo es el que no debe llegar a la pantalla.
    expect(error?.message).toContain('violates check constraint');

    const mensaje = mapDbError(error!);

    expect(mensaje).not.toContain('violates check constraint');
    expect(mensaje).not.toContain('props_active_requires');
    expect(mensaje).not.toContain('new row for relation');
    // Los dos CHECK de activación tienen mensaje propio; cuál de los dos toque
    // depende del orden de evaluación, así que se acepta cualquiera de ellos y
    // se rechaza el genérico, que sería la señal de que falta un mapeo.
    expect([
      'No se puede activar sin tarifa al huésped y pago al aseador.',
      'No se puede activar sin un aseador responsable.',
    ]).toContain(mensaje);
  });

  test('la puerta de contacto_externo de una unidad informativa NO tiene 23514 detrás', async () => {
    // Esto NO es un fallo que arreglar en una migración: está declarado en
    // `apartamento.schema.ts` y en UI-SPEC §8.2. `props_active_requires_owner`
    // está condicionado a `not (is_active and gestion_vivaguest)`, así que con
    // `gestion_vivaguest = false` es verdadero por vacuidad y la base DEJA
    // activar una unidad informativa sin contacto.
    //
    // Se escribe como test y no como comentario porque es la única forma de que
    // se ponga rojo el día que alguien "arregle" el CHECK: entonces habría que
    // revisar el esquema de Zod, no borrar esta prueba.
    const apartamento = await crearApartamento({
      gestion_vivaguest: false,
      contacto_externo: null,
    });

    const { data, error } = await clienteConToken(tokenAdmin)
      .from('properties')
      .update({ is_active: true })
      .eq('id', apartamento.id)
      .select('id, is_active');

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].is_active).toBe(true);

    // La única red que existe para este caso es la de la UI: el refinamiento de
    // `esquemaActivar` y la revalidación de `activarApartamento`.
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PERSISTENCIA DE LOS CAMPOS DEL FORMULARIO
// ════════════════════════════════════════════════════════════════════════════

describe('persistencia del apartamento y de sus secretos', () => {
  test('un borrador con solo nombre y cluster persiste con is_active = false', async () => {
    const nombre = `Int Borrador ${randomUUID().slice(0, 8)}`;

    // El insert va con el token del admin, que es el hecho que se mide. La
    // representación de vuelta pide solo `id`: desde la migración 24 un comodín
    // en el RETURNING pide privilegio sobre las dos columnas de dinero, que
    // `authenticated` ya no tiene, y devolvería 42501 sobre un insert correcto.
    const { data: creado, error } = await clienteConToken(tokenAdmin)
      .from('properties')
      .insert({ nombre, cluster: 'Int Cluster Borrador' })
      .select('id')
      .single();

    expect(error).toBeNull();
    if (creado) propiedadesCreadas.push(creado.id);

    // La fila entera, incluidas las dos cifras que este test afirma vacías, la
    // lee el cliente de servicio, que conserva su grant de tabla.
    const { data } = await servicio()
      .from('properties')
      .select('*')
      .eq('id', creado!.id)
      .single();

    // UI-SPEC §8.2 regla 1: "Guarda incompleto, sin ruido, sin confirmación".
    expect(data?.is_active).toBe(false);
    expect(data?.nombre).toBe(nombre);
    expect(data?.tarifa_huesped).toBeNull();
    expect(data?.pago_aseador).toBeNull();
    expect(data?.responsable_id).toBeNull();
    // Los defaults del DDL que el formulario da por hechos (APTO-05).
    expect(data?.gestion_vivaguest).toBe(true);
    expect(data?.hora_limite).toBe('11:30:00');
    expect(data?.fee_discriminado).toBe(false);
  });

  test('los cuatro secretos persisten, Y el mismo select con el JWT del admin da 42501', async () => {
    const apartamento = await crearApartamento();

    // Mitad 1: se escribe por la ÚNICA ruta posible y persiste.
    const { error: errorEscritura } = await servicio().from('property_secrets').upsert(
      {
        property_id: apartamento.id,
        tipo_cerradura: 'llave_fisica',
        codigo_acceso: '4821#',
        notas_acceso: 'Portería pide cédula.',
        ical_url: 'https://www.airbnb.com/calendar/ical/persistencia.ics',
        updated_by: uidAdmin,
      },
      { onConflict: 'property_id' },
    );
    expect(errorEscritura).toBeNull();

    const { data, error } = await servicio()
      .from('property_secrets')
      .select('codigo_acceso, tipo_cerradura, notas_acceso, ical_url')
      .eq('property_id', apartamento.id)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({
      codigo_acceso: '4821#',
      tipo_cerradura: 'llave_fisica',
      notas_acceso: 'Portería pide cédula.',
      ical_url: 'https://www.airbnb.com/calendar/ical/persistencia.ics',
    });

    // Mitad 2, y sin ella la primera no dice nada: EL MISMO SELECT, sobre la
    // MISMA fila que acabamos de ver llena, con el JWT del admin, da 42501.
    // Aquí es donde "persistió" deja de ser compatible con "y es alcanzable".
    const { data: comoAdmin, error: errorAdmin } = await clienteConToken(tokenAdmin)
      .from('property_secrets')
      .select('codigo_acceso, tipo_cerradura, notas_acceso, ical_url')
      .eq('property_id', apartamento.id);

    expect(errorAdmin?.code).toBe('42501');
    expect(comoAdmin).toBeNull();
  });

  test('el upsert que omite la URL de exportación no la borra', async () => {
    // Es el bug silencioso que `guardarApartamento` evita omitiendo esa columna:
    // el formulario del apartamento no gestiona el calendario (UI-SPEC §8.1),
    // así que cada guardado escribiría `null` sobre la credencial que conectó el
    // plan 02-14, y el síntoma aparecería un día después en el sync.
    const apartamento = await crearApartamento();
    const admin = servicio();

    await admin.from('property_secrets').upsert(
      {
        property_id: apartamento.id,
        ical_url: 'https://www.airbnb.com/calendar/ical/no-la-borres.ics',
      },
      { onConflict: 'property_id' },
    );

    // Segundo guardado, con la forma exacta del payload de `guardarApartamento`:
    // los tres campos de la sección 4 y NINGUNA mención a la columna de la URL.
    await admin.from('property_secrets').upsert(
      {
        property_id: apartamento.id,
        tipo_cerradura: 'inteligente',
        codigo_acceso: '9931',
        notas_acceso: null,
        updated_by: uidAdmin,
      },
      { onConflict: 'property_id' },
    );

    const { data } = await admin
      .from('property_secrets')
      .select('codigo_acceso, ical_url')
      .eq('property_id', apartamento.id)
      .single();

    expect(data?.codigo_acceso).toBe('9931');
    expect(data?.ical_url).toBe('https://www.airbnb.com/calendar/ical/no-la-borres.ics');
  });

  test('desactivar deja is_active = false y NO toca cleanings', async () => {
    const apartamento = await crearApartamento({
      gestion_vivaguest: true,
      tarifa_huesped: 120000,
      pago_aseador: 45000,
      responsable_id: uidAseador,
    });

    // Se activa por la vía normal: con las tres puertas cumplidas la base deja.
    const { error: errorActivar } = await clienteConToken(tokenAdmin)
      .from('properties')
      .update({ is_active: true })
      .eq('id', apartamento.id)
      .select('id');
    expect(errorActivar).toBeNull();

    const filaDeAseo = {
      property_id: apartamento.id,
      origin: 'manual',
      scheduled_date: hoyEnBogota(),
      aseador_id: uidAseador,
    } satisfies Partial<Database['public']['Tables']['cleanings']['Insert']>;

    const { data: aseo, error: errorAseo } = await servicio()
      .from('cleanings')
      .insert(filaDeAseo as Database['public']['Tables']['cleanings']['Insert'])
      .select('id')
      .single();
    expect(errorAseo).toBeNull();
    if (aseo) aseosCreados.push(aseo.id);

    // CONTROL: hay algo que perder. Un "antes 0, después 0" es el verde vacío
    // que el plan 02-09 midió y que esta aserción existe para no repetir.
    const { count: antes } = await servicio()
      .from('cleanings')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', apartamento.id);

    expect(antes).toBeGreaterThan(0);

    const { data: desactivado, error: errorDesactivar } = await clienteConToken(tokenAdmin)
      .from('properties')
      .update({ is_active: false })
      .eq('id', apartamento.id)
      .select('id, is_active');

    expect(errorDesactivar).toBeNull();
    expect(desactivado?.[0].is_active).toBe(false);

    const { count: despues } = await servicio()
      .from('cleanings')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', apartamento.id);

    // Desactivar un apartamento no cancela ni borra sus aseos: es una decisión
    // de catálogo, no de operación.
    expect(despues).toBe(antes);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL CATÁLOGO SEMBRADO SIGUE INTACTO
// ════════════════════════════════════════════════════════════════════════════

test('las 39 filas sembradas siguen siendo 39, con sus 8 clusters y sus 5 informativas', async () => {
  const { data, error } = await servicio()
    .from('properties')
    .select('id, cluster, gestion_vivaguest');

  expect(error).toBeNull();

  // Se excluyen SOLO las que creó este archivo. El catálogo real es el que el
  // admin va a montar y su conteo alimenta aserciones de otros planes: si este
  // test se pone rojo, algo de aquí escribió donde no debía.
  const creadas = new Set(propiedadesCreadas);
  const sembradas = (data ?? []).filter((p) => !creadas.has(p.id));

  expect(sembradas).toHaveLength(SEMILLA_TOTAL);
  expect(sembradas.filter((p) => !p.gestion_vivaguest)).toHaveLength(SEMILLA_INFORMATIVAS);
  expect(new Set(sembradas.map((p) => p.cluster)).size).toBe(SEMILLA_CLUSTERS);
});
