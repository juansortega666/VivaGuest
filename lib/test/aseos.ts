import { randomUUID } from 'node:crypto';

import type { Database } from '@/lib/database.types';

import { clienteAdminDePruebas, type ClienteVivaGuest } from './clientes';

/**
 * ARNÉS DE SIEMBRA DE ASEOS PARA LAS SUITES DE INTEGRACIÓN DEL DASHBOARD.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * VIVE EN `lib/test/` A PROPÓSITO, Y ESA UBICACIÓN ES LA EXCEPCIÓN.
 *
 * `scripts/ci/check-service-role.sh` exceptúa `lib/test/` en los guardarraíles
 * 5, 7 y 8: aquí se importa la fábrica administrativa sin ningún guard, a
 * propósito. La razón es la de siempre y no ha cambiado: un test que siembra
 * con el MISMO cliente con el que comprueba pasa aunque la policy esté mal
 * escrita. La excepción es de directorio y es deliberadamente estrecha; nada
 * bajo `app/` importa este archivo, así que nunca entra al bundle.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LO QUE ESTE ARNÉS **NO** HACE, Y POR QUÉ ────────────────────────────────
 *
 * No siembra feeds ni reservas. Ni una línea.
 *
 * El escenario de dos corridas de sync que necesita la aserción del Pitfall 1
 * (plan 04-07, el señuelo de mayor valor de la fase) se arma COMPONIENDO
 * `sembrarFeed()` de `lib/test/sync.ts` con este arnés, no duplicando la
 * siembra de feeds aquí. Un helper que sabe de las dos cosas se convierte en el
 * sitio donde las dos se desincronizan: el día que cambie la forma del feed hay
 * que acordarse de dos archivos, y el segundo se queda atrás en silencio.
 *
 * Corolario práctico: los aseos que siembra este arnés tienen `reservation_id`
 * nulo. Cualquier prueba que necesite un aseo APUNTANDO a una reserva la crea
 * ella, con el feed de `sync.ts`.
 *
 * ── LAS FECHAS SALEN DE LA BASE, NUNCA DEL PROCESO ─────────────────────────
 *
 * La suite corre con `TZ=UTC` (`vitest.integration.config.ts`, deliberado). Un
 * `new Date().toISOString().slice(0,10)` devuelve MAÑANA durante las cinco
 * horas en que UTC ya cambió de día y Bogotá todavía no, así que un aseo
 * sembrado "para hoy" a las 19:30 de Bogotá caería en el bloque "Mañana" del
 * dashboard y el test mediría otra cosa sin decirlo.
 *
 * Por eso el día base se pide a `public.today_bog()`, que es la MISMA función
 * que usan las policies, los índices y el motor de sync. Sobre esa cadena
 * `YYYY-MM-DD` se suma con aritmética de calendario explícita: ver `sumarDias`.
 *
 * ── EL ORDEN DE BORRADO NO ES NEGOCIABLE ───────────────────────────────────
 *
 * `cleanings.property_id` es `on delete RESTRICT` (migración 04, deliberado:
 * borrar un apartamento con historial operativo tiene que doler) y
 * `properties.responsable_id` también lo es contra `profiles`. La cadena
 * completa:
 *
 *     cleanings  →  properties  →  auth.users (y profiles por cascade)
 *
 * Invertir cualquier eslabón da 23503 y deja la base sucia para el archivo
 * siguiente, que es como se contamina una suite entera desde un solo test.
 */

type FilaDeAseo = Database['public']['Tables']['cleanings']['Row'];

/**
 * Los once objetos del escenario, con nombre.
 *
 * Devolver un array e indexarlo por posición es cómo un test se rompe en
 * silencio al reordenar la siembra: el índice 3 sigue existiendo y sigue siendo
 * un uuid válido, solo que ya no es el aseo que la aserción cree. Con nombres,
 * ese error es un fallo de compilación.
 */
export type EscenarioDeAseos = {
  /** Gestionado y activo, con responsable Y suplente, distintos entre sí. */
  aptoGestionado: string;
  /** `gestion_vivaguest = false`, con `contacto_externo` poblado (DASH-07). */
  aptoExterno: string;

  /** Activa. Es la responsable del apartamento gestionado. */
  aseadorA: string;
  /** Activa. Es la suplente. El destino natural de una reasignación. */
  aseadorB: string;
  /** `is_active = false`. Nadie le puede asignar trabajo. */
  aseadorInactivo: string;

  /** `pendiente` con `confirmado_at` nulo: lo que alimenta la bandeja DASH-02. */
  aseoSinConfirmar: string;
  /** `pendiente` ya confirmado y asignado en firme. */
  aseoPendiente: string;
  /** `en_curso`, con `started_at` real. */
  aseoEnCurso: string;
  /** `completada`, terminal. */
  aseoTerminado: string;
  /** `cancelada`, terminal. */
  aseoCancelado: string;
  /** Fila inerte de gestión externa: sin estado y sin aseador. */
  aseoInerte: string;

  /** Las fechas usadas, ya resueltas contra la base. Ahorra repetir el RPC. */
  fechas: {
    ayer: string;
    hoy: string;
    manana: string;
    enTresDias: string;
  };
};

/** Lo sembrado por este arnés, para que `limpiarAseos()` borre eso y nada más. */
const aseosSembrados: string[] = [];
const propiedadesSembradas: string[] = [];
const usuariosSembrados: string[] = [];

/**
 * Suma días a un día de negocio en forma `YYYY-MM-DD`.
 *
 * AQUÍ SÍ SE CONSTRUYE UN INSTANTE, y es correcto. Lo que la regla del proyecto
 * prohíbe es LEER EL RELOJ para deducir el día (`new Date()` a secas), porque
 * bajo `TZ=UTC` eso adelanta el día durante cinco horas cada noche. Esto es
 * otra cosa: aritmética de calendario sobre componentes que YA vienen resueltos
 * por `public.today_bog()`, anclados explícitamente en UTC con `Date.UTC` y
 * devueltos a la misma forma de cadena. No hay ninguna zona horaria implicada y
 * el resultado no depende de cuándo corra el proceso.
 *
 * Se hace así, y no restando 86 400 000 milisegundos a mano, porque el cruce de
 * mes y el año bisiesto son exactamente los dos casos donde la resta a pelo
 * falla y donde nadie tiene un test.
 */
export function sumarDias(fecha: string, dias: number): string {
  const [ano, mes, dia] = fecha.split('-').map(Number);
  const instante = new Date(Date.UTC(ano, mes - 1, dia));
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString().slice(0, 10);
}

/**
 * El día de negocio de hoy SEGÚN LA BASE.
 *
 * Se pide por RPC y no se calcula en el proceso a propósito: es la única forma
 * de que el arnés y los índices, policies y jobs que van a evaluar estas filas
 * estén mirando el mismo día. `today_bog()` tiene `grant execute` para
 * `service_role` desde la migración 07.
 */
async function hoySegunLaBase(admin: ClienteVivaGuest): Promise<string> {
  const { data, error } = await admin.rpc('today_bog');
  if (error || !data) {
    throw new Error(`No se pudo leer today_bog(): ${error?.message ?? 'sin dato'}`);
  }
  return data;
}

async function crearAseador(
  admin: ClienteVivaGuest,
  nombre: string,
  sufijo: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `int.aseos.${sufijo}@vivaguest.test`,
    password: `pw-${randomUUID()}`,
    // Sin esto GoTrue exige confirmar por correo y cualquier login posterior
    // devolvería `email_not_confirmed`, que enmascara lo que se quiere medir.
    email_confirm: true,
    // El rol va en los DOS sitios y no es redundante: `app_metadata` lo emite
    // GoTrue dentro del JWT y lo lee el middleware; `user_metadata` es lo que
    // lee `tg_handle_new_user` para materializar `public.profiles`.
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: nombre },
  });

  if (error || !data.user) {
    throw new Error(`No se pudo sembrar a ${nombre}: ${error?.message}`);
  }

  usuariosSembrados.push(data.user.id);
  return data.user.id;
}

/**
 * Deja en la base, en una sola llamada, el escenario completo del dashboard.
 *
 * ── POR QUÉ LAS FECHAS SON CUATRO Y NO TRES ────────────────────────────────
 *
 * `cleanings_one_active_per_property_date` es un índice ÚNICO PARCIAL sobre
 * `(property_id, scheduled_date) where state is distinct from 'cancelada'`. El
 * apartamento gestionado tiene cuatro aseos NO cancelados (sin confirmar,
 * pendiente, en curso y terminado), así que necesita cuatro fechas distintas:
 * tres no alcanzan, y el intento devuelve 23505.
 *
 * El cancelado SÍ comparte fecha con el aseo en curso, y eso es deliberado: es
 * la fixture que demuestra que el índice es PARCIAL. Si alguien lo convirtiera
 * en total, la siembra entera fallaría aquí y no tres capas más arriba.
 *
 * El terminado va AYER porque es como se ve en la realidad: un aseo completado
 * pertenece al pasado. Ponerlo en el futuro produciría un escenario que el
 * dashboard nunca va a mostrar.
 */
export async function sembrarEscenarioDeAseos(): Promise<EscenarioDeAseos> {
  const admin = clienteAdminDePruebas();
  const sufijo = randomUUID().slice(0, 8);

  const hoy = await hoySegunLaBase(admin);
  const fechas = {
    ayer: sumarDias(hoy, -1),
    hoy,
    manana: sumarDias(hoy, 1),
    enTresDias: sumarDias(hoy, 3),
  };

  const aseadorA = await crearAseador(admin, 'Aseadora A de escenario', `a.${sufijo}`);
  const aseadorB = await crearAseador(admin, 'Aseadora B de escenario', `b.${sufijo}`);
  const aseadorInactivo = await crearAseador(
    admin,
    'Aseadora C de escenario',
    `c.${sufijo}`,
  );

  // `profiles_deactivation_coherent` exige que `is_active` y `deactivated_at`
  // se muevan a la vez. Escribir solo uno da 23514.
  const { error: errorBaja } = await admin
    .from('profiles')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', aseadorInactivo);

  if (errorBaja) throw new Error(`No se pudo desactivar a la aseadora C: ${errorBaja.message}`);

  // El apartamento gestionado. `hora_limite` distinta del default del schema a
  // propósito: es lo que permite afirmar que el snapshot del aseo la COPIÓ del
  // apartamento, y no que coincidió con el default.
  const { data: gestionado, error: errorGestionado } = await admin
    .from('properties')
    .insert({
      nombre: `Int Aseos Gestionado ${sufijo}`,
      cluster: 'Int Cluster Aseos',
      gestion_vivaguest: true,
      hora_limite: '10:15',
      tarifa_huesped: 120000,
      pago_aseador: 45000,
      responsable_id: aseadorA,
      suplente_id: aseadorB,
      is_active: true,
    })
    .select('id')
    .single();

  if (errorGestionado || !gestionado) {
    throw new Error(`No se pudo sembrar el apartamento gestionado: ${errorGestionado?.message}`);
  }
  propiedadesSembradas.push(gestionado.id);

  // La unidad informativa. `props_assignees_only_when_managed` exige que NO
  // tenga responsable ni suplente: quien la atiende va en `contacto_externo`.
  const { data: externo, error: errorExterno } = await admin
    .from('properties')
    .insert({
      nombre: `Int Aseos Externo ${sufijo}`,
      cluster: 'Int Cluster Aseos',
      gestion_vivaguest: false,
      contacto_externo: `Administracion externa ${sufijo}`,
      is_active: true,
    })
    .select('id')
    .single();

  if (errorExterno || !externo) {
    throw new Error(`No se pudo sembrar el apartamento externo: ${errorExterno?.message}`);
  }
  propiedadesSembradas.push(externo.id);

  const ahora = new Date();
  const haceCincoHoras = new Date(ahora.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const haceCuatroHoras = new Date(ahora.getTime() - 4 * 60 * 60 * 1000).toISOString();
  const haceNoventaMinutos = new Date(ahora.getTime() - 90 * 60 * 1000).toISOString();

  // Las formas de cada estado no son estilo: son los CHECK de la migración 04.
  //   cl_en_curso_shape    → confirmado_at, aseador_id y started_at no nulos,
  //                          finished_at nulo
  //   cl_completada_shape  → started_at y finished_at no nulos, y el segundo
  //                          no anterior al primero
  //   cl_cancelada_shape   → cancelled_at no nulo
  //   cl_pendiente_shape   → started_at y finished_at nulos
  //   cl_unmanaged_is_inert→ en gestión externa TODO va nulo y el estado también
  //
  // ── POR QUÉ LAS FILAS SE DECLARAN `Partial` Y SE CASTEAN AL INSERTAR ──────
  //
  // El tipo `Insert` generado por el CLI exige `hora_limite` e `is_managed`,
  // porque son NOT NULL y no tienen DEFAULT en el DDL. Pero NO se escriben aquí:
  // las pone `tg_cleanings_snapshot()` en el BEFORE INSERT, y los CHECK de tabla
  // se evalúan DESPUÉS de los triggers BEFORE, así que el NOT NULL queda
  // satisfecho sin que el llamante sepa nada de ellas. Es exactamente lo que
  // hace el paso (c) del sync.
  //
  // Escribirlas aquí para contentar al compilador sería peor que este cast: el
  // `is_managed` del aseo es un SNAPSHOT de `gestion_vivaguest` y ponerlo a mano
  // permite sembrar un aseo cuyo snapshot contradice a su apartamento, que es un
  // estado que la base nunca produce.
  //
  // Mismo patrón que `lib/domain/feed.integration.test.ts`, por la misma razón.
  const filas = [
      {
        property_id: gestionado.id,
        origin: 'ical',
        state: 'pendiente',
        scheduled_date: fechas.manana,
      },
      {
        property_id: gestionado.id,
        origin: 'ical',
        state: 'pendiente',
        scheduled_date: fechas.enTresDias,
        aseador_id: aseadorA,
        confirmado_at: ahora.toISOString(),
        num_huespedes: 2,
        instrucciones: 'Dejar toallas extra',
      },
      {
        property_id: gestionado.id,
        origin: 'ical',
        state: 'en_curso',
        scheduled_date: fechas.hoy,
        aseador_id: aseadorA,
        confirmado_at: ahora.toISOString(),
        started_at: haceNoventaMinutos,
      },
      {
        property_id: gestionado.id,
        origin: 'ical',
        state: 'completada',
        scheduled_date: fechas.ayer,
        aseador_id: aseadorA,
        confirmado_at: haceCincoHoras,
        started_at: haceCincoHoras,
        finished_at: haceCuatroHoras,
      },
      {
        property_id: gestionado.id,
        origin: 'ical',
        state: 'cancelada',
        // Comparte fecha con el aseo en curso: el índice único es PARCIAL y
        // excluye lo cancelado. Ver la cabecera de esta función.
        scheduled_date: fechas.hoy,
        cancelled_at: ahora.toISOString(),
        // Slug de la lista cerrada que escribe el sync. NO se usa
        // `cancelado_por_admin` a propósito: ese lo escribe `cancel_cleaning`,
        // y tenerlo ya puesto en la fixture enmascararía un fallo de esa RPC.
        cancel_reason: 'reserva_desaparecida',
      },
      {
        property_id: externo.id,
        origin: 'ical',
        // El trigger `tg_cleanings_snapshot` fuerza `state` a nulo en gestión
        // externa. Se manda explícito para que el contrato quede escrito aquí y
        // no dependa de que el trigger siga haciéndolo.
        state: null,
        scheduled_date: fechas.hoy,
      },
  ] satisfies Partial<Database['public']['Tables']['cleanings']['Insert']>[];

  const { data: aseos, error: errorAseos } = await admin
    .from('cleanings')
    .insert(filas as Database['public']['Tables']['cleanings']['Insert'][])
    .select('id, property_id, state, scheduled_date, confirmado_at');

  if (errorAseos || !aseos) {
    throw new Error(`No se pudieron sembrar los aseos: ${errorAseos?.message}`);
  }
  // Enlace aparte tras el guard: `typeof aseos` en posición de TIPO usa el tipo
  // DECLARADO, que sigue incluyendo `null`, no el estrechado por el `if`.
  const sembrados = aseos;
  for (const aseo of sembrados) aseosSembrados.push(aseo.id);

  // La identificación es por PROPIEDAD del dato y no por el orden del array
  // devuelto: PostgREST no garantiza que un insert múltiple devuelva las filas
  // en el orden en que se mandaron, y confiar en eso es un fallo intermitente.
  const buscar = (predicado: (a: (typeof sembrados)[number]) => boolean, que: string): string => {
    const hallado = sembrados.filter(predicado);
    if (hallado.length !== 1) {
      throw new Error(`Se esperaba exactamente un aseo ${que}, hay ${hallado.length}.`);
    }
    return hallado[0].id;
  };

  return {
    aptoGestionado: gestionado.id,
    aptoExterno: externo.id,
    aseadorA,
    aseadorB,
    aseadorInactivo,
    aseoSinConfirmar: buscar(
      (a) => a.state === 'pendiente' && a.confirmado_at === null,
      'sin confirmar',
    ),
    aseoPendiente: buscar(
      (a) => a.state === 'pendiente' && a.confirmado_at !== null,
      'pendiente confirmado',
    ),
    aseoEnCurso: buscar((a) => a.state === 'en_curso', 'en curso'),
    aseoTerminado: buscar((a) => a.state === 'completada', 'terminado'),
    aseoCancelado: buscar((a) => a.state === 'cancelada', 'cancelado'),
    aseoInerte: buscar((a) => a.property_id === externo.id, 'inerte de gestión externa'),
    fechas,
  };
}

/**
 * La fila CRUDA del aseo, sin ningún embed.
 *
 * Sin embeds a propósito, y por dos razones. La primera es que su uso es
 * comparar la fila antes y después de una mutación byte a byte: un embed mete
 * datos de otra tabla en la comparación y convierte un cambio ajeno en un falso
 * positivo. La segunda es que `cleanings` tiene DOS claves foráneas hacia
 * `profiles` (`aseador_id` y `confirmado_by`), así que un `profiles(...)` sin
 * calificar devuelve `PGRST201` por ambigüedad, en tiempo de ejecución y no de
 * compilación.
 *
 * Devuelve `null` si el aseo no existe, que es lo correcto para afirmar que una
 * creación denegada no creó nada.
 */
export async function leerAseo(id: string): Promise<FilaDeAseo | null> {
  const { data, error } = await clienteAdminDePruebas()
    .from('cleanings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el aseo ${id}: ${error.message}`);
  return data;
}

/**
 * Borra lo que sembró este arnés, en orden de FK, y nada más.
 *
 * IDEMPOTENTE: la segunda llamada no hace nada y no lanza. Es lo que permite
 * ponerla en un `afterAll` y también en el camino de error de un test sin tener
 * que llevar la cuenta de si ya se llamó.
 *
 * Se borra POR ID y nunca por un `delete` sobre la tabla entera: el stack local
 * es UNO solo, compartido entre worktrees, y un borrado amplio se lleva por
 * delante la semilla de desarrollo y los datos de otro archivo de la suite.
 *
 * Los aseos van PRIMERO. Los aseos que hayan creado los tests con las RPC del
 * admin —y que este arnés no registró— se borran también, filtrando por
 * apartamento: un aseo huérfano bloquearía el borrado del apartamento con 23503
 * y dejaría la base sucia, que es el fallo que contamina el archivo siguiente.
 */
export async function limpiarAseos(): Promise<void> {
  const admin = clienteAdminDePruebas();

  if (propiedadesSembradas.length > 0) {
    const { error } = await admin
      .from('cleanings')
      .delete()
      .in('property_id', propiedadesSembradas);
    if (error) throw new Error(`No se pudieron borrar los aseos: ${error.message}`);
  } else if (aseosSembrados.length > 0) {
    const { error } = await admin.from('cleanings').delete().in('id', aseosSembrados);
    if (error) throw new Error(`No se pudieron borrar los aseos: ${error.message}`);
  }
  aseosSembrados.length = 0;

  if (propiedadesSembradas.length > 0) {
    const { error } = await admin.from('properties').delete().in('id', propiedadesSembradas);
    if (error) throw new Error(`No se pudieron borrar los apartamentos: ${error.message}`);
    propiedadesSembradas.length = 0;
  }

  // `profiles` cae por cascade desde `auth.users`, y con él las notificaciones
  // y suscripciones push del usuario. Va al final porque `properties` referencia
  // `profiles` con `on delete restrict`.
  for (const uid of usuariosSembrados) {
    await admin.auth.admin.deleteUser(uid);
  }
  usuariosSembrados.length = 0;
}
