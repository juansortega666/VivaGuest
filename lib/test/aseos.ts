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

// ═══════════════════════════════════════════════════════════════════════════
// EL SEMBRADOR DE PERIODO FINANCIERO COMPLETO (Fase 7)
//
// Lo consumen la capa de integración del cálculo del cierre y los specs de
// punta a punta. Vive AQUÍ y no en cada archivo por la razón de siempre: un
// escenario financiero sembrado a mano en tres sitios diverge en el tercer mes
// y entonces nadie sabe cuál es el bueno.
//
// ── LOS SEIS CASOS BORDE QUE DECIDEN LA CORRECCIÓN DE LA FASE ──────────────
//
//   1. Un aseo terminado a las 23:30 de Bogotá DEL DÍA DE CIERRE. Es la trampa
//      central: `finished_at` es un instante y la pertenencia al periodo es una
//      pregunta sobre días de negocio. Resuelta en tiempo universal, ese aseo
//      cae al día SIGUIENTE y se va al periodo equivocado. Como un periodo
//      cerrado no se recalcula nunca, el error sería permanente y le cambiaría
//      el pago a una persona.
//   2. Su espejo: uno terminado a las 00:30 de Bogotá del día siguiente al
//      cierre, que SÍ pertenece al periodo siguiente. Sin el espejo, una
//      implementación que desplazara todo un día pasaría el caso 1.
//   3. Uno cuya fecha programada y cuya fecha de ejecución caen en periodos
//      distintos (programado antes del cierre, hecho después). Es el que el
//      desglose tiene que saber pintar con las dos fechas.
//   4. Un gasto con su fila de foto de recibo.
//   5. Un aseo del periodo que queda SIN COMPLETAR cuando el periodo cierra.
//   6. Una unidad de gestión externa y una aseadora desactivada. La externa no
//      puede aparecer en ningún total ni conteo; la aseadora de baja SÍ, porque
//      se le debe el trabajo que hizo antes de la baja.
//
// ── POR QUÉ ESCRIBE CON EL CLIENTE DE SERVICIO ────────────────────────────
//
// Deliberado, igual que el resto de este archivo: lo que se prueba con grants y
// policies es pgTAP, con roles reales. Un test que siembra con el mismo cliente
// con el que comprueba pasa aunque la policy esté mal escrita.
// ═══════════════════════════════════════════════════════════════════════════

/** Un periodo de pago, de cierre a cierre (D7-5). Los dos extremos incluidos. */
export type PeriodoDeSiembra = {
  /** Día siguiente al cierre del mes anterior. */
  desde: string;
  /** El día de cierre. Es donde se ancla el aseo de las 23:30. */
  hasta: string;
};

/**
 * Los objetos del escenario financiero, con nombre.
 *
 * Misma regla que `EscenarioDeAseos`: nunca un arreglo indexado por posición.
 * El índice 3 sigue siendo un uuid válido después de reordenar la siembra, solo
 * que ya no es el aseo que la aserción cree.
 */
export type EscenarioFinanciero = {
  /** Gestionado. Tarifas propias, distintas de las del segundo. */
  aptoUno: string;
  /** Gestionado. Tarifas DISTINTAS a las del primero, a propósito. */
  aptoDos: string;
  /** `gestion_vivaguest = false`. No entra en ningún total ni en ningún conteo. */
  aptoExterno: string;

  /** Activa. Hace el grueso del periodo, incluidos los dos casos del filo. */
  aseadoraUno: string;
  /** Activa. La del daño y la del aseo que queda sin completar. */
  aseadoraDos: string;
  /**
   * `is_active = false`, y CON trabajo completado dentro del periodo.
   *
   * No es un adorno: darla de baja no borra lo que ya hizo, y el cierre le tiene
   * que seguir debiendo ese dinero. Un cálculo que filtre por aseadora activa
   * deja a una persona sin cobrar, y este es el escenario que lo delata.
   */
  aseadoraDeBaja: string;

  /** CASO 1. `finished_at` a las 23:30 de Bogotá del día de cierre. */
  aseoAlFiloDelCierre: string;
  /** CASO 2. `finished_at` a las 00:30 de Bogotá del día siguiente al cierre. */
  aseoDeLaMadrugadaSiguiente: string;
  /** CASO 3. Programado dentro del periodo, terminado en el siguiente. */
  aseoProgramadoEnOtroPeriodo: string;
  /** CASO 4. Completado, con su gasto y la fila de foto del recibo. */
  aseoConGasto: string;
  /** Completado, con un daño reportado. Alimenta el conteo del bloque 2. */
  aseoConDano: string;
  /** Completado por la aseadora que después se dio de baja. */
  aseoDeLaAseadoraDeBaja: string;
  /** CASO 5. Confirmado y asignado, pero nunca terminado. */
  aseoSinCompletar: string;
  /** CASO 6. Fila inerte de gestión externa: sin estado, sin aseadora, sin tarifas. */
  aseoExterno: string;

  /** El gasto del CASO 4, con su recibo. El monto va en pesos enteros. */
  gasto: {
    id: string;
    monto: number;
    /** La fila de `cleaning_photos` con `kind = 'gasto'`. */
    fotoId: string;
    /** Ruta con la convención `{cleaning_id}/{kind}/{uuid}.{ext}`. */
    storagePath: string;
  };

  /** El daño del bloque 2. */
  dano: string;

  /** El periodo sembrado, calculado y nunca literal. */
  periodo: PeriodoDeSiembra;

  fechas: {
    /** El día de negocio SEGÚN LA BASE, del que cuelga todo lo demás. */
    hoy: string;
    /** `periodo.hasta`, repetido aquí porque es la fecha que más se afirma. */
    cierre: string;
    /** El día siguiente al cierre: ya es del periodo siguiente. */
    diaSiguienteAlCierre: string;
    /** El día en que se ejecutó el aseo del CASO 3. Periodo siguiente. */
    ejecucionTardia: string;
  };

  /** Las tarifas snapshoteadas, para afirmar totales sin releer la base. */
  tarifas: {
    aptoUno: { tarifaHuesped: number; pagoAseador: number };
    aptoDos: { tarifaHuesped: number; pagoAseador: number };
  };
};

/** Tarifas del primer apartamento gestionado. */
const TARIFAS_UNO = { tarifaHuesped: 150_000, pagoAseador: 55_000 } as const;
/** DISTINTAS a las del primero: un total correcto no puede salir de multiplicar. */
const TARIFAS_DOS = { tarifaHuesped: 90_000, pagoAseador: 38_000 } as const;
/** El monto del gasto del CASO 4, en pesos enteros. */
const MONTO_DEL_GASTO = 23_400;

/**
 * El ÚLTIMO DÍA HÁBIL del mes al que pertenece `fecha`, como ancla de fixture.
 *
 * ⚠️ ESTO NO ES EL CALENDARIO DE NEGOCIO, Y LA DISTINCIÓN IMPORTA.
 *
 * El calendario de negocio vive en Postgres y tiene su gemelo en el dominio de
 * la aplicación; su paridad se mide sobre 36 meses en un test dedicado. Esto de
 * aquí es otra cosa: el ancla que el arnés necesita para colocar el aseo del
 * filo en un día que de verdad sea un cierre, sin importar cuándo corra la
 * suite. Vive en `lib/test/` porque el arnés de pruebas no importa módulos de
 * aplicación —misma razón por la que `sumarDias` está duplicada arriba— y
 * porque si algún día divergieran, es ESTE archivo el que se ajusta.
 *
 * Quien quiera el ancla autoritativa le pasa el periodo por parámetro a
 * `sembrarPeriodoCompleto()` y esta función no se usa.
 *
 * Sábado retrocede al viernes; domingo retrocede al viernes. Sin festivos, por
 * decisión explícita del ROADMAP. Aritmética de calendario anclada en UTC, como
 * `sumarDias`: no hay ninguna zona horaria implicada.
 */
function cierreDelMesDe(fecha: string): string {
  const [ano, mes] = fecha.split('-').map(Number);
  // Día 0 del mes SIGUIENTE es el último día de este mes. Resuelve de paso el
  // año bisiesto sin una tabla de longitudes de mes.
  const dia = new Date(Date.UTC(ano, mes, 0));
  while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
    dia.setUTCDate(dia.getUTCDate() - 1);
  }
  return dia.toISOString().slice(0, 10);
}

/** El primer día del mes al que pertenece `fecha`. */
function primerDiaDelMesDe(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

/**
 * Un instante EN HORA DE BOGOTÁ a partir de un día de negocio y una hora.
 *
 * El desfase va explícito y fijo porque Colombia no tiene horario de verano
 * desde 1993, y porque es exactamente lo que ya hace `lib/domain/dates.test.ts`
 * para fijar sus instantes. Escribir estas marcas con `Z` las movería cinco
 * horas y destruiría el único caso que el escenario existe para producir: a las
 * 23:30 de Bogotá del día de cierre, el día universal YA es el siguiente.
 */
function instanteBog(dia: string, hora: string): string {
  return `${dia}T${hora}:00-05:00`;
}

/**
 * Deja en la base un PERIODO DE PAGO COMPLETO, con sus seis casos borde.
 *
 * ── POR QUÉ EL PERIODO SE CALCULA Y NUNCA SE ESCRIBE LITERAL ──────────────
 *
 * Un `'2026-01-30'` en la fixture hace que la suite empiece a fallar sola en
 * 2027, y el día que falle nadie va a estar mirando este archivo.
 *
 * El ancla por defecto es el mes al que pertenece `hoy - 45 días`, y esos 45
 * días no son un número redondo: garantizan que el mes ancla esté CERRADO
 * corra cuando corra la suite, incluido el día 1. Con el mes anterior a secas,
 * una corrida del día 2 dejaría el aseo de ejecución tardía (cierre + 3 días)
 * en el FUTURO, que es un estado que el cierre real nunca produce.
 *
 * ── QUIEN TENGA EL PERIODO AUTORITATIVO, QUE LO PASE ──────────────────────
 *
 * `opciones.periodo` existe para que la capa de integración le dé el periodo
 * que devuelve Postgres en vez del ancla local. Así el arnés no se convierte en
 * una tercera opinión sobre cuándo cierra el mes.
 */
export async function sembrarPeriodoCompleto(opciones?: {
  periodo?: PeriodoDeSiembra;
}): Promise<EscenarioFinanciero> {
  const admin = clienteAdminDePruebas();
  const sufijo = randomUUID().slice(0, 8);

  const hoy = await hoySegunLaBase(admin);

  const mesAncla = sumarDias(hoy, -45);
  const cierre = opciones?.periodo?.hasta ?? cierreDelMesDe(mesAncla);
  const periodo: PeriodoDeSiembra = {
    desde:
      opciones?.periodo?.desde ??
      sumarDias(cierreDelMesDe(sumarDias(primerDiaDelMesDe(mesAncla), -1)), 1),
    hasta: cierre,
  };

  const diaSiguienteAlCierre = sumarDias(cierre, 1);
  const ejecucionTardia = sumarDias(cierre, 3);

  const aseadoraUno = await crearAseador(admin, 'Aseadora Uno de finanzas', `f1.${sufijo}`);
  const aseadoraDos = await crearAseador(admin, 'Aseadora Dos de finanzas', `f2.${sufijo}`);
  const aseadoraDeBaja = await crearAseador(
    admin,
    'Aseadora Tres de finanzas',
    `f3.${sufijo}`,
  );

  // El aseo de la aseadora de baja se siembra DESPUÉS de desactivarla, y sigue
  // entrando: la baja no borra lo que ya hizo. Es el escenario que delata un
  // cálculo que filtre por aseadora activa.
  // `profiles_deactivation_coherent` exige que las dos columnas se muevan a la
  // vez; escribir solo una da 23514.
  const { error: errorBaja } = await admin
    .from('profiles')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', aseadoraDeBaja);
  if (errorBaja) {
    throw new Error(`No se pudo desactivar a la aseadora de baja: ${errorBaja.message}`);
  }

  const crearApartamento = async (
    etiqueta: string,
    tarifas: { tarifaHuesped: number; pagoAseador: number },
    responsable: string,
  ): Promise<string> => {
    const { data, error } = await admin
      .from('properties')
      .insert({
        nombre: `Int Fin ${etiqueta} ${sufijo}`,
        cluster: 'Int Cluster Finanzas',
        gestion_vivaguest: true,
        hora_limite: '10:45',
        tarifa_huesped: tarifas.tarifaHuesped,
        pago_aseador: tarifas.pagoAseador,
        responsable_id: responsable,
        is_active: true,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`No se pudo sembrar el apartamento ${etiqueta}: ${error?.message}`);
    }
    propiedadesSembradas.push(data.id);
    return data.id;
  };

  const aptoUno = await crearApartamento('Uno', TARIFAS_UNO, aseadoraUno);
  const aptoDos = await crearApartamento('Dos', TARIFAS_DOS, aseadoraDos);

  // `props_assignees_only_when_managed` exige que la unidad informativa NO
  // tenga responsable ni suplente: quien la atiende va en `contacto_externo`.
  // Y `props_active_requires_rates` no le pide tarifas, a propósito: no hay
  // nada que cobrar ni que pagar en una unidad que no es negocio propio.
  const { data: externo, error: errorExterno } = await admin
    .from('properties')
    .insert({
      nombre: `Int Fin Externo ${sufijo}`,
      cluster: 'Int Cluster Finanzas',
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

  const confirmado = instanteBog(periodo.desde, '08:00');

  // ── LAS FECHAS, Y POR QUÉ NINGUNA COLISIONA ──────────────────────────────
  //
  // `cleanings_one_active_per_property_date` es único y PARCIAL sobre
  // (property_id, scheduled_date) excluyendo lo cancelado. Aquí no hay ningún
  // aseo cancelado, así que las fechas de un mismo apartamento tienen que ser
  // todas distintas o el insert devuelve 23505:
  //
  //   apto uno → cierre, cierre+1, cierre-2, cierre-5
  //   apto dos → cierre-5, cierre-3, cierre-1
  //   externo  → cierre-3
  //
  // El desplazamiento máximo hacia atrás es de cinco días, muy por dentro del
  // periodo más corto posible (febrero da unos veintisiete días), así que todo
  // lo que se declara "dentro del periodo" lo está de verdad.
  //
  // Las filas se declaran `Partial` y se castean al insertar por la misma razón
  // que el sembrador de operación: `hora_limite`, `is_managed` y las tarifas las
  // pone `tg_cleanings_snapshot()` en el BEFORE INSERT, y los CHECK de tabla se
  // evalúan DESPUÉS de los triggers BEFORE. Escribirlas a mano permitiría
  // sembrar un aseo cuyo snapshot contradice a su apartamento, que es un estado
  // que la base nunca produce.
  const filas = [
    // CASO 1. El filo. 23:30 de Bogotá del día de cierre = 04:30 universal del
    // día SIGUIENTE. Si la pertenencia al periodo se resuelve sin convertir a
    // día de negocio, este aseo se va al periodo siguiente y una persona cobra
    // de menos, para siempre.
    {
      property_id: aptoUno,
      origin: 'ical',
      state: 'completada',
      scheduled_date: cierre,
      aseador_id: aseadoraUno,
      confirmado_at: confirmado,
      num_huespedes: 2,
      started_at: instanteBog(cierre, '22:00'),
      finished_at: instanteBog(cierre, '23:30'),
    },
    // CASO 2. El espejo. 00:30 de Bogotá = 05:30 universal del MISMO día. Este
    // sí pertenece al periodo siguiente. Sin él, una implementación que
    // desplazara todo un día pasaría el caso 1 y seguiría estando mal.
    {
      property_id: aptoUno,
      origin: 'ical',
      state: 'completada',
      scheduled_date: diaSiguienteAlCierre,
      aseador_id: aseadoraUno,
      confirmado_at: confirmado,
      num_huespedes: 3,
      started_at: instanteBog(diaSiguienteAlCierre, '00:05'),
      finished_at: instanteBog(diaSiguienteAlCierre, '00:30'),
    },
    // CASO 3. Programado dentro del periodo, hecho en el siguiente. Cuenta en el
    // periodo en que SE TERMINÓ (D7-8), y el desglose lo pinta con las dos
    // fechas: un aseo de enero en el recibo de febrero parece un error si solo
    // se ve una.
    {
      property_id: aptoUno,
      origin: 'ical',
      state: 'completada',
      scheduled_date: sumarDias(cierre, -2),
      aseador_id: aseadoraUno,
      confirmado_at: confirmado,
      num_huespedes: 2,
      started_at: instanteBog(ejecucionTardia, '13:30'),
      finished_at: instanteBog(ejecucionTardia, '15:00'),
    },
    // CASO 4. El del gasto con recibo.
    {
      property_id: aptoUno,
      origin: 'ical',
      state: 'completada',
      scheduled_date: sumarDias(cierre, -5),
      aseador_id: aseadoraUno,
      confirmado_at: confirmado,
      num_huespedes: 4,
      started_at: instanteBog(sumarDias(cierre, -5), '14:00'),
      finished_at: instanteBog(sumarDias(cierre, -5), '16:00'),
    },
    // El del daño. En el SEGUNDO apartamento, con tarifas distintas: así un
    // total correcto no se puede obtener multiplicando el número de aseos por
    // una tarifa única.
    {
      property_id: aptoDos,
      origin: 'ical',
      state: 'completada',
      scheduled_date: sumarDias(cierre, -5),
      aseador_id: aseadoraDos,
      confirmado_at: confirmado,
      num_huespedes: 2,
      started_at: instanteBog(sumarDias(cierre, -5), '09:00'),
      finished_at: instanteBog(sumarDias(cierre, -5), '11:00'),
    },
    // El de la aseadora ya desactivada. Se le sigue debiendo.
    {
      property_id: aptoDos,
      origin: 'ical',
      state: 'completada',
      scheduled_date: sumarDias(cierre, -3),
      aseador_id: aseadoraDeBaja,
      confirmado_at: confirmado,
      num_huespedes: 1,
      started_at: instanteBog(sumarDias(cierre, -3), '09:30'),
      finished_at: instanteBog(sumarDias(cierre, -3), '11:15'),
    },
    // CASO 5. Confirmado y asignado, nunca terminado. Es el contador de no
    // computados: el periodo cierra y este aseo no entra en ningún total.
    // `cl_pendiente_shape` exige las dos marcas de ejecución nulas.
    {
      property_id: aptoDos,
      origin: 'ical',
      state: 'pendiente',
      scheduled_date: sumarDias(cierre, -1),
      aseador_id: aseadoraDos,
      confirmado_at: confirmado,
      num_huespedes: 2,
    },
    // CASO 6. Gestión externa. `tg_cleanings_snapshot` fuerza el estado a nulo;
    // se manda explícito para que el contrato quede escrito aquí y no dependa
    // de que el trigger siga haciéndolo.
    {
      property_id: externo.id,
      origin: 'ical',
      state: null,
      scheduled_date: sumarDias(cierre, -3),
    },
  ] satisfies Partial<Database['public']['Tables']['cleanings']['Insert']>[];

  const { data: aseos, error: errorAseos } = await admin
    .from('cleanings')
    .insert(filas as Database['public']['Tables']['cleanings']['Insert'][])
    .select('id, property_id, state, scheduled_date, finished_at');

  if (errorAseos || !aseos) {
    throw new Error(`No se pudieron sembrar los aseos del periodo: ${errorAseos?.message}`);
  }
  const sembrados = aseos;
  for (const aseo of sembrados) aseosSembrados.push(aseo.id);

  // Identificación por PROPIEDAD del dato y nunca por el orden del arreglo:
  // PostgREST no garantiza que un insert múltiple devuelva las filas en el
  // orden en que se mandaron, y confiar en eso es un fallo intermitente.
  const buscar = (apartamento: string, fecha: string, que: string): string => {
    const hallado = sembrados.filter(
      (a) => a.property_id === apartamento && a.scheduled_date === fecha,
    );
    if (hallado.length !== 1) {
      throw new Error(`Se esperaba exactamente un aseo ${que}, hay ${hallado.length}.`);
    }
    return hallado[0].id;
  };

  const aseoAlFiloDelCierre = buscar(aptoUno, cierre, 'al filo del cierre');
  const aseoDeLaMadrugadaSiguiente = buscar(
    aptoUno,
    diaSiguienteAlCierre,
    'de la madrugada siguiente',
  );
  const aseoProgramadoEnOtroPeriodo = buscar(
    aptoUno,
    sumarDias(cierre, -2),
    'programado en otro periodo',
  );
  const aseoConGasto = buscar(aptoUno, sumarDias(cierre, -5), 'con gasto');
  const aseoConDano = buscar(aptoDos, sumarDias(cierre, -5), 'con daño');
  const aseoDeLaAseadoraDeBaja = buscar(aptoDos, sumarDias(cierre, -3), 'de la aseadora de baja');
  const aseoSinCompletar = buscar(aptoDos, sumarDias(cierre, -1), 'sin completar');
  const aseoExterno = buscar(externo.id, sumarDias(cierre, -3), 'de gestión externa');

  const { data: gasto, error: errorGasto } = await admin
    .from('expenses')
    .insert({
      cleaning_id: aseoConGasto,
      property_id: aptoUno,
      concepto: 'Bolsas de basura y desinfectante',
      monto: MONTO_DEL_GASTO,
      reported_by: aseadoraUno,
    })
    .select('id')
    .single();

  if (errorGasto || !gasto) {
    throw new Error(`No se pudo sembrar el gasto: ${errorGasto?.message}`);
  }

  // ── EL RECIBO: LA LÍNEA CONTABLE, NO EL OBJETO ───────────────────────────
  //
  // NO se sube nada a Storage a propósito. Lo que este escenario tiene que
  // producir es la fila que enlaza el gasto con su recibo, que es lo que el
  // desglose recorre. El estado "recibo ausente" es un estado DECLARADO de la
  // interfaz, no un fallo, así que un test que abra el recibo y no encuentre el
  // objeto sigue midiendo algo cierto.
  //
  // La convención de ruta es contrato duro: `{cleaning_id}/{kind}/{uuid}.{ext}`.
  // Las policies de Storage autorizan comparando el PRIMER segmento con el aseo
  // del aseador, así que una ruta con otra forma rompe la autorización en
  // silencio.
  const storagePath = `${aseoConGasto}/gasto/${randomUUID()}.jpg`;
  const { data: foto, error: errorFoto } = await admin
    .from('cleaning_photos')
    .insert({
      cleaning_id: aseoConGasto,
      kind: 'gasto',
      expense_id: gasto.id,
      storage_bucket: 'evidencia',
      storage_path: storagePath,
      mime_type: 'image/jpeg',
      bytes: 204_800,
      width: 1280,
      height: 960,
      uploaded_by: aseadoraUno,
    })
    .select('id')
    .single();

  if (errorFoto || !foto) {
    throw new Error(`No se pudo sembrar la foto del recibo: ${errorFoto?.message}`);
  }

  const { data: dano, error: errorDano } = await admin
    .from('damages')
    .insert({
      cleaning_id: aseoConDano,
      property_id: aptoDos,
      descripcion: 'Puerta del closet descuadrada',
      reported_by: aseadoraDos,
    })
    .select('id')
    .single();

  if (errorDano || !dano) {
    throw new Error(`No se pudo sembrar el daño: ${errorDano?.message}`);
  }

  return {
    aptoUno,
    aptoDos,
    aptoExterno: externo.id,
    aseadoraUno,
    aseadoraDos,
    aseadoraDeBaja,
    aseoAlFiloDelCierre,
    aseoDeLaMadrugadaSiguiente,
    aseoProgramadoEnOtroPeriodo,
    aseoConGasto,
    aseoConDano,
    aseoDeLaAseadoraDeBaja,
    aseoSinCompletar,
    aseoExterno,
    gasto: {
      id: gasto.id,
      monto: MONTO_DEL_GASTO,
      fotoId: foto.id,
      storagePath,
    },
    dano: dano.id,
    periodo,
    fechas: {
      hoy,
      cierre,
      diaSiguienteAlCierre,
      ejecucionTardia,
    },
    tarifas: {
      aptoUno: { ...TARIFAS_UNO },
      aptoDos: { ...TARIFAS_DOS },
    },
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
 *
 * ── TAMBIÉN LIMPIA EL ESCENARIO FINANCIERO ─────────────────────────────────
 *
 * `sembrarPeriodoCompleto()` registra sus apartamentos y sus usuarios en los
 * MISMOS tres registros de arriba, así que esta función los borra sin ninguna
 * rama aparte. Y eso es deliberado: dos funciones de limpieza son dos sitios
 * donde acordarse, y el segundo se queda atrás en silencio.
 *
 * Los gastos, los daños y las fotos NO se nombran aquí porque cuelgan del aseo
 * con `on delete cascade` y caen con él. Lo que sí importa es el orden, que ya
 * está resuelto: los aseos primero, y con ellos sus hijas, antes de tocar los
 * apartamentos —`damages.property_id` y `expenses.property_id` son `on delete
 * restrict` contra `properties`, así que al revés daría 23503—.
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
