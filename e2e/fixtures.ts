import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { test as base, expect, type Page } from '@playwright/test';

import type { Database, Enums } from '@/lib/database.types';

import {
  ARCHIVO_CREDENCIALES,
  DIR_AUTH,
  clienteDeServicio,
  type Credenciales,
  type RolE2E,
} from './global-setup';

/**
 * Fixtures de sesión para la suite E2E.
 *
 * Regla de la suite: **el único test que hace login por UI es el test de login.**
 * El resto arranca con la sesión ya puesta. Un test de "el aseador ve sus aseos"
 * que empieza tecleando email y contraseña no está probando los aseos: está
 * probando el login otra vez, y se cae por razones que no tienen que ver con lo que
 * dice medir.
 */

export { expect };

/** Credenciales que sembró `global-setup.ts` en esta corrida. */
export function leerCredenciales(): Credenciales {
  if (!existsSync(ARCHIVO_CREDENCIALES)) {
    throw new Error(
      `No existe ${ARCHIVO_CREDENCIALES}. Lo escribe e2e/global-setup.ts al arrancar.\n` +
        'Si corriste Playwright con --no-deps o con el globalSetup desactivado, vuelve a correr `npm run test:e2e`.',
    );
  }
  return JSON.parse(readFileSync(ARCHIVO_CREDENCIALES, 'utf8')) as Credenciales;
}

function rutaStorageState(clave: string): string {
  return resolve(DIR_AUTH, `${clave}.storage.json`);
}

/**
 * Hace login por UI UNA sola vez por rol y persiste el `storageState`.
 *
 * Se hace por UI y no inyectando cookies a mano a propósito: así el estado guardado
 * es exactamente el que produce el flujo real, incluido lo que escriba el
 * middleware. Una sesión fabricada a mano puede diferir del artículo genuino justo
 * en el detalle que el criterio 1 quiere probar.
 */
export async function iniciarSesionPorUI(page: Page, clave: string): Promise<string> {
  const destino = rutaStorageState(clave);
  const credenciales = leerCredenciales();
  const usuario = credenciales[clave];

  if (!usuario) {
    throw new Error(
      `No hay credenciales para "${clave}". Claves disponibles: ${Object.keys(credenciales).join(', ')}`,
    );
  }

  await page.goto('/login');
  // Selectores por etiqueta EXACTA, y la razon no es estilistica: la pantalla
  // (plan 02-06) tiene un boton de mostrar/ocultar contrasena cuyo `aria-label`
  // es "Mostrar contraseña". Un `getByLabel(/contrase/i)` casa con el input Y con
  // ese boton, y Playwright falla por strict mode. El nombre accesible del boton
  // no se puede quitar: va sin texto visible y lo exige UI-SPEC §13.
  await page.getByLabel('Email').fill(usuario.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(usuario.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // No basta con que el click no falle: hay que esperar a que el middleware haya
  // ruteado fuera de /login, o se guardaría un storageState sin sesión.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  await page.context().storageState({ path: destino });
  return destino;
}

async function paginaConSesion(browser: import('@playwright/test').Browser, clave: string) {
  const destino = rutaStorageState(clave);

  if (!existsSync(destino)) {
    // Primera vez en esta corrida: se paga el login una vez y se reutiliza.
    const contextoLogin = await browser.newContext();
    const paginaLogin = await contextoLogin.newPage();
    await iniciarSesionPorUI(paginaLogin, clave);
    await contextoLogin.close();
  }

  const contexto = await browser.newContext({ storageState: destino });
  return { contexto, pagina: await contexto.newPage() };
}

interface FixturesVivaGuest {
  /** Página con sesión de administrador ya iniciada. */
  paginaAdmin: Page;
  /** Página con sesión de aseador ya iniciada (el `aseador1` de la semilla). */
  paginaAseador: Page;
  /** Rol del usuario semilla secundario, para tests de aislamiento entre aseadores. */
  paginaAseador2: Page;
}

export const test = base.extend<FixturesVivaGuest>({
  paginaAdmin: async ({ browser }, use) => {
    const { contexto, pagina } = await paginaConSesion(browser, 'admin');
    await use(pagina);
    await contexto.close();
  },

  paginaAseador: async ({ browser }, use) => {
    const { contexto, pagina } = await paginaConSesion(browser, 'aseador1');
    await use(pagina);
    await contexto.close();
  },

  paginaAseador2: async ({ browser }, use) => {
    const { contexto, pagina } = await paginaConSesion(browser, 'aseador2');
    await use(pagina);
    await contexto.close();
  },
});

export type { RolE2E };

// ═══════════════════════════════════════════════════════════════════════════════
// SIEMBRA DE ESCENARIOS DE OPERACIÓN (plan 04-14)
//
// Es el equivalente para `e2e/` de lo que `lib/test/aseos.ts` hace para las suites
// de integración, y NO se importa de allí: ese módulo pasa por
// `lib/test/clientes.ts`, que importa `lib/supabase/admin.ts` con su
// `import 'server-only'`, cuyo `index.js` es un `throw` que el transpilador de
// Playwright no neutraliza (la condición `react-server` no se activa acá). Es la
// misma razón por la que `global-setup.ts` construye su propio cliente de
// servicio en vez de reutilizar la fábrica.
//
// Lo que sí se conserva de aquel arnés son las tres reglas que costaron medirse:
//
//   1. EL DÍA SALE DE LA BASE, NUNCA DEL PROCESO. `public.today_bog()` es la
//      misma función que usan las policies, los índices y la ventana de
//      `leerOperacion()`. Un `new Date()` en el proceso devuelve MAÑANA durante
//      las cinco horas en que UTC ya cambió de día y Bogotá todavía no, y un aseo
//      sembrado "para hoy" caería en el bloque `Mañana`.
//   2. EL ORDEN DE BORRADO NO ES NEGOCIABLE: cleanings → properties →
//      auth.users. `cleanings.property_id` y `properties.responsable_id` son
//      `on delete restrict` a propósito. Invertir un eslabón da 23503 y deja la
//      base sucia para el archivo siguiente, que es como se contamina una suite
//      entera desde un solo test.
//   3. SE BORRA POR ID Y NUNCA POR TABLA. El stack local es UNO solo, compartido
//      entre worktrees y entre specs; un `delete` amplio se lleva la semilla de
//      desarrollo por delante.
//
// ── LO QUE ESTA SIEMBRA NO TIENE Y ES DELIBERADO ──────────────────────────────
// No hay estado a nivel de módulo. Con `workers: 1` Playwright reutiliza el mismo
// proceso para varios archivos de spec, así que un registro global de "lo
// sembrado" sobreviviría de un spec al siguiente y el `afterAll` de uno borraría
// lo del otro. Cada `sembrarOperacion()` devuelve TODOS los ids que creó y
// `limpiarOperacion()` borra exactamente esos.
// ═══════════════════════════════════════════════════════════════════════════════

/** El cliente de servicio, con el tipo ya resuelto. Solo para sembrar y limpiar. */
export type Servicio = ReturnType<typeof clienteDeServicio>;

/**
 * Suma días a un día de negocio `YYYY-MM-DD`.
 *
 * Aquí SÍ se construye un instante y es correcto: es aritmética de calendario
 * sobre componentes que ya vienen resueltos por `today_bog()`, anclada en UTC con
 * `Date.UTC` y devuelta a la misma forma de cadena. No hay ninguna zona horaria
 * implicada. Lo que la regla del proyecto prohíbe es LEER EL RELOJ para deducir
 * el día. Se hace así, y no restando 86 400 000 ms, porque el cruce de mes y el
 * año bisiesto son los dos casos donde la resta a pelo falla sin que nadie mire.
 */
export function sumarDias(fecha: string, dias: number): string {
  const [ano, mes, dia] = fecha.split('-').map(Number);
  const instante = new Date(Date.UTC(ano, mes - 1, dia));
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString().slice(0, 10);
}

/** El día de negocio de hoy SEGÚN LA BASE. Ver la regla 1 de la cabecera. */
export async function diaDeNegocio(servicio: Servicio): Promise<string> {
  const { data, error } = await servicio.rpc('today_bog');
  if (error || !data) {
    throw new Error(`No se pudo leer today_bog(): ${error?.message ?? 'sin dato'}`);
  }
  return data;
}

/**
 * El id de un usuario a partir de su email.
 *
 * La API de admin no expone "buscar por email", así que se pagina el listado. Con
 * un puñado de usuarios en local es trivial.
 */
export async function idPorEmail(servicio: Servicio, email: string): Promise<string> {
  let pagina = 1;
  for (;;) {
    const { data, error } = await servicio.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (encontrado) return encontrado.id;
    if (data.users.length < 200) throw new Error(`No existe el usuario ${email}`);
    pagina += 1;
  }
}

/** Un apartamento sembrado, con lo que las aserciones necesitan nombrar. */
export interface UnidadSembrada {
  id: string;
  nombre: string;
}

/** Una aseadora sembrada. */
export interface AseadoraSembrada {
  id: string;
  nombre: string;
}

/** Lo que `sembrarOperacion()` deja en la base y `limpiarOperacion()` borra. */
export interface EscenarioDeOperacion {
  /** Gestionada, activa, completa y con responsable. El sujeto del flujo del admin. */
  gestionada: UnidadSembrada;
  /** Segunda gestionada: hace falta para chocar fechas sin tocar la primera. */
  segunda: UnidadSembrada;
  /**
   * Tercera gestionada. Existe por una razón aritmética, no por simetría: el
   * índice único parcial `cleanings_one_active_per_property_date` deja UN aseo
   * activo por apartamento y fecha, y la ventana de `/operacion` son siete días
   * (hoy … hoy+6). Con dos unidades el techo son catorce aseos sin confirmar y el
   * `Sheet` encadenado hay que probarlo con QUINCE, que es la tanda que una
   * corrida del sync mete de golpe y para la que está calibrado (§10).
   */
  tercera: UnidadSembrada;
  /** `gestion_vivaguest = false`, con `contacto_externo` poblado (DASH-07). */
  externa: UnidadSembrada & { contacto: string };

  /** Responsable fija de las dos gestionadas. */
  aseadoraA: AseadoraSembrada;
  /** Suplente. El destino natural de una reasignación. */
  aseadoraB: AseadoraSembrada;

  /** Las fechas ya resueltas contra la base. Ahorra repetir el RPC. */
  fechas: {
    ayer: string;
    hoy: string;
    manana: string;
    pasado: string;
    enCuatroDias: string;
  };

  /** Sufijo aleatorio de esta corrida. Va en los nombres, para poder buscarlos. */
  sufijo: string;
}

/**
 * Siembra las tres unidades y las dos aseadoras del escenario del dashboard.
 *
 * NO siembra ni un solo aseo: cada spec decide los suyos con `sembrarAseos()`.
 * Es deliberado y es lo contrario de lo que hace el arnés de integración, que
 * siembra once objetos de golpe. La razón es la bandeja `Sin confirmar`: cuenta
 * TODOS los aseos sin confirmar de la ventana, vengan del apartamento que vengan,
 * así que un escenario que trajera aseos "de regalo" haría que el `Confirmar 15
 * aseos` de un test dijera 17 por culpa de otro.
 *
 * Los nombres llevan el prefijo `E2E Op` y un sufijo aleatorio: se distinguen a
 * simple vista de la semilla real de 39 unidades y dos corridas solapadas no
 * chocan entre sí.
 */
export async function sembrarOperacion(servicio: Servicio): Promise<EscenarioDeOperacion> {
  const sufijo = randomUUID().slice(0, 8);
  const hoy = await diaDeNegocio(servicio);

  const aseadoraA = await crearAseadora(servicio, `Aseadora Ana ${sufijo}`, `a.${sufijo}`);
  const aseadoraB = await crearAseadora(servicio, `Aseadora Bea ${sufijo}`, `b.${sufijo}`);

  // `hora_limite` distinta del default del schema a propósito: es lo que permite
  // afirmar que el aseo COPIÓ la del apartamento y no que coincidió con el
  // default. Las tres columnas de activación (tarifas + responsable) van juntas o
  // `props_active_requires_rates` y `props_active_requires_owner` la rechazan.
  const gestionada = await crearUnidadGestionada(
    servicio,
    `E2E Op Gestionada ${sufijo}`,
    sufijo,
    aseadoraA.id,
    aseadoraB.id,
  );
  const segunda = await crearUnidadGestionada(
    servicio,
    `E2E Op Segunda ${sufijo}`,
    sufijo,
    aseadoraA.id,
    aseadoraB.id,
  );
  const tercera = await crearUnidadGestionada(
    servicio,
    `E2E Op Tercera ${sufijo}`,
    sufijo,
    aseadoraA.id,
    aseadoraB.id,
  );

  // `props_assignees_only_when_managed` exige que la informativa NO tenga
  // responsable ni suplente: quien la atiende va en `contacto_externo`.
  const contacto = `Administración Externa ${sufijo}`;
  const { data: externa, error: errorExterna } = await servicio
    .from('properties')
    .insert({
      nombre: `E2E Op Externa ${sufijo}`,
      cluster: `E2E Op ${sufijo}`,
      gestion_vivaguest: false,
      contacto_externo: contacto,
      is_active: true,
    })
    .select('id, nombre')
    .single();

  if (errorExterna || !externa) {
    throw new Error(`No se pudo sembrar la unidad externa: ${errorExterna?.message}`);
  }

  return {
    gestionada,
    segunda,
    tercera,
    externa: { ...externa, contacto },
    aseadoraA,
    aseadoraB,
    fechas: {
      ayer: sumarDias(hoy, -1),
      hoy,
      manana: sumarDias(hoy, 1),
      pasado: sumarDias(hoy, 2),
      enCuatroDias: sumarDias(hoy, 4),
    },
    sufijo,
  };
}

async function crearAseadora(
  servicio: Servicio,
  nombre: string,
  sufijo: string,
): Promise<AseadoraSembrada> {
  const { data, error } = await servicio.auth.admin.createUser({
    email: `e2e.op.${sufijo}@vivaguest.test`,
    password: `pw-${randomUUID()}`,
    // Sin esto GoTrue exigiría confirmación por correo. No hace falta para
    // sembrar, pero deja al usuario en el mismo estado que los de `global-setup`.
    email_confirm: true,
    // El rol va en los DOS sitios y no es redundante: `app_metadata` viaja en el
    // JWT y lo lee el middleware; `user_metadata` es lo que lee
    // `tg_handle_new_user` para materializar la fila de `public.profiles`.
    app_metadata: { role: 'aseador' },
    user_metadata: { role: 'aseador', full_name: nombre },
  });

  if (error || !data.user) throw new Error(`No se pudo sembrar a ${nombre}: ${error?.message}`);
  return { id: data.user.id, nombre };
}

async function crearUnidadGestionada(
  servicio: Servicio,
  nombre: string,
  sufijo: string,
  responsable: string,
  suplente: string,
): Promise<UnidadSembrada> {
  const { data, error } = await servicio
    .from('properties')
    .insert({
      nombre,
      cluster: `E2E Op ${sufijo}`,
      gestion_vivaguest: true,
      hora_limite: '10:15',
      tarifa_huesped: 120000,
      pago_aseador: 45000,
      responsable_id: responsable,
      suplente_id: suplente,
      is_active: true,
    })
    .select('id, nombre')
    .single();

  if (error || !data) throw new Error(`No se pudo sembrar ${nombre}: ${error?.message}`);
  return data;
}

/**
 * Borra lo que sembró `sembrarOperacion()`, EN ORDEN DE FK, y nada más.
 *
 * Idempotente: la segunda llamada no hace nada y no lanza. Es lo que permite
 * ponerla en un `afterAll` y también en el camino de error de un test.
 *
 * Los aseos van PRIMERO y se borran POR APARTAMENTO, no por la lista de ids que
 * este módulo sembró: los que crearon los tests pulsando `Crear aseo` en el
 * navegador no están en ninguna lista, y un aseo huérfano bloquearía el borrado
 * del apartamento con 23503. Lo mismo con las alertas: `notifications` cuelga de
 * `cleanings` y de `properties` con `on delete cascade`, así que caen solas, pero
 * las que no cuelgan de ninguno (la que apunta solo al admin) hay que borrarlas
 * a mano y por eso existe `limpiarAlertas()`.
 */
export async function limpiarOperacion(
  servicio: Servicio,
  escenario: EscenarioDeOperacion,
): Promise<void> {
  const propiedades = [
    escenario.gestionada.id,
    escenario.segunda.id,
    escenario.tercera.id,
    escenario.externa.id,
  ];

  const aseos = await servicio.from('cleanings').delete().in('property_id', propiedades);
  if (aseos.error) throw new Error(`No se pudieron borrar los aseos: ${aseos.error.message}`);

  const props = await servicio.from('properties').delete().in('id', propiedades);
  if (props.error) throw new Error(`No se pudieron borrar los apartamentos: ${props.error.message}`);

  // `profiles` cae por cascade desde `auth.users`. Va al final porque
  // `properties.responsable_id` referencia `profiles` con `on delete restrict`.
  for (const aseadora of [escenario.aseadoraA, escenario.aseadoraB]) {
    await servicio.auth.admin.deleteUser(aseadora.id);
  }
}

/** Un aseo a sembrar. Lo que no se diga sale del trigger o del CHECK. */
export interface AseoASembrar {
  /** El apartamento. Si es la unidad externa, la fila nace inerte por CHECK. */
  propiedad: string;
  fecha: string;
  /**
   * `undefined` deja que el trigger decida (`pendiente` en gestionada, `null` en
   * externa), que es lo que hace el sync de verdad.
   */
  estado?: 'pendiente' | 'en_curso' | 'completada' | 'cancelada';
  aseador?: string;
  /** `true` escribe `confirmado_at`. Sin él la fila cae en la bandeja. */
  confirmado?: boolean;
  urgente?: boolean;
  tipo?: 'normal' | 'repaso' | 'emergencia';
  /**
   * Pisa el snapshot de `properties.hora_limite`. Es lo que permite sembrar un
   * aseo con la hora límite ya vencida, que es la entrada de la alerta computada
   * `hora_limite_vencida`. El trigger hace `coalesce(new.hora_limite, p.…)`, así
   * que mandarla explícita es el camino soportado, no un rodeo (APTO-05).
   */
  horaLimite?: string;
  huespedes?: number;
}

/**
 * Siembra aseos y devuelve sus ids EN EL MISMO ORDEN en que se pidieron.
 *
 * El orden se garantiza con un insert por fila y no con uno múltiple: PostgREST
 * no promete devolver las filas de un insert múltiple en el orden en que se
 * mandaron, y confiar en eso es un fallo intermitente que aparece un martes.
 *
 * ── POR QUÉ EL `as` AL INSERTAR ──────────────────────────────────────────────
 * El tipo `Insert` generado por el CLI exige `hora_limite` e `is_managed`, porque
 * son NOT NULL sin DEFAULT en el DDL. Pero las pone `tg_cleanings_snapshot()` en
 * el BEFORE INSERT, y los CHECK de tabla se evalúan DESPUÉS de los triggers
 * BEFORE. Escribir `is_managed` a mano para contentar al compilador sería PEOR
 * que el cast: permitiría sembrar un aseo cuyo snapshot contradice a su
 * apartamento, un estado que la base nunca produce. Mismo patrón y misma razón
 * que `lib/test/aseos.ts`.
 */
export async function sembrarAseos(
  servicio: Servicio,
  filas: AseoASembrar[],
): Promise<string[]> {
  const ids: string[] = [];

  for (const fila of filas) {
    const { data, error } = await servicio
      .from('cleanings')
      .insert(construirAseo(fila) as Database['public']['Tables']['cleanings']['Insert'])
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(
        `No se pudo sembrar el aseo de ${fila.propiedad} del ${fila.fecha}: ${error?.message}`,
      );
    }
    ids.push(data.id);
  }

  return ids;
}

/**
 * Arma la fila respetando las formas de la migración 04.
 *
 * Las cuatro no son estilo, son los CHECK:
 *   cl_pendiente_shape    → `started_at` y `finished_at` nulos
 *   cl_en_curso_shape     → confirmado, aseador y `started_at` no nulos; fin nulo
 *   cl_completada_shape   → inicio y fin no nulos, y el fin no anterior al inicio
 *   cl_cancelada_shape    → `cancelled_at` no nulo
 */
function construirAseo(fila: AseoASembrar): Partial<
  Database['public']['Tables']['cleanings']['Insert']
> {
  const ahora = Date.now();
  const haceCuatroHoras = new Date(ahora - 4 * 60 * 60 * 1000).toISOString();
  const haceDosHoras = new Date(ahora - 2 * 60 * 60 * 1000).toISOString();
  const haceUnaHora = new Date(ahora - 60 * 60 * 1000).toISOString();

  const base: Record<string, unknown> = {
    property_id: fila.propiedad,
    origin: 'ical',
    scheduled_date: fila.fecha,
  };

  if (fila.tipo !== undefined) base.tipo = fila.tipo;
  if (fila.horaLimite !== undefined) base.hora_limite = fila.horaLimite;
  if (fila.urgente !== undefined) base.is_urgent = fila.urgente;
  if (fila.huespedes !== undefined) base.num_huespedes = fila.huespedes;
  if (fila.estado !== undefined) base.state = fila.estado;
  if (fila.aseador !== undefined) base.aseador_id = fila.aseador;
  if (fila.confirmado) base.confirmado_at = haceCuatroHoras;

  if (fila.estado === 'en_curso') {
    base.confirmado_at = haceCuatroHoras;
    base.started_at = haceDosHoras;
  }

  if (fila.estado === 'completada') {
    base.confirmado_at = haceCuatroHoras;
    base.started_at = haceDosHoras;
    base.finished_at = haceUnaHora;
  }

  if (fila.estado === 'cancelada') {
    base.cancelled_at = haceUnaHora;
    // Slug de la lista cerrada que escribe el sync. NO se usa
    // `cancelado_por_admin`: ese lo escribe `cancel_cleaning`, y tenerlo puesto
    // de fábrica enmascararía un fallo de esa RPC.
    base.cancel_reason = 'reserva_desaparecida';
  }

  return base as Partial<Database['public']['Tables']['cleanings']['Insert']>;
}

/**
 * Una alerta a sembrar en `notifications`.
 *
 * ── POR QUÉ ESTO EXISTE, Y HAY QUE DECIRLO EN VOZ ALTA ───────────────────────
 * De los siete tipos que el panel tiene que mostrar a la vez (UI-SPEC §11.1),
 * CUATRO no los escribe ninguna migración hoy: `extension_sospechosa`,
 * `no_puedo`, `dano_reportado` y `faltantes_reportados`. Los dos primeros llegan
 * con la PWA del aseador (Fase 6) y el tercero con los reportes de campo. Se
 * siembran a mano con el cliente de servicio para poder probar el panel, y el
 * nombre de cada spec que lo hace tiene que decirlo, para que nadie lea el verde
 * como "esto ocurre solo".
 */
export interface AlertaASembrar {
  tipo: Enums<'notification_type'>;
  titulo: string;
  cuerpo: string;
  url?: string | null;
  aseo?: string | null;
  propiedad?: string | null;
  /** El instante del hecho. Es el ÚNICO criterio de orden del panel (D-06). */
  creadaEnMs: number;
}

/**
 * Siembra alertas para un destinatario, de una en una y en orden.
 *
 * `recipient_id` es NOT NULL y no existe "una notificación para el rol": el panel
 * lee por destinatario, así que sembrar para otro usuario produciría un panel
 * vacío y un fallo que apunta al sitio equivocado.
 */
export async function sembrarAlertas(
  servicio: Servicio,
  destinatario: string,
  filas: AlertaASembrar[],
): Promise<string[]> {
  const ids: string[] = [];

  for (const fila of filas) {
    const { data, error } = await servicio
      .from('notifications')
      .insert({
        recipient_id: destinatario,
        type: fila.tipo,
        title: fila.titulo,
        body: fila.cuerpo,
        url: fila.url ?? null,
        cleaning_id: fila.aseo ?? null,
        property_id: fila.propiedad ?? null,
        created_at: new Date(fila.creadaEnMs).toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`No se pudo sembrar la alerta ${fila.tipo}: ${error?.message}`);
    }
    ids.push(data.id);
  }

  return ids;
}

/**
 * Borra TODAS las alertas de un destinatario.
 *
 * Por destinatario y no por lista de ids a propósito: el panel cuenta el total de
 * lo que hay para ese usuario, así que una alerta huérfana de un test anterior
 * hace que el contador diga 31 donde el test espera 30, y el fallo aparece en el
 * test equivocado. El destinatario es siempre un usuario `e2e.` que `global-setup`
 * crea y borra en cada corrida, así que el alcance sigue siendo estrecho.
 */
export async function limpiarAlertas(servicio: Servicio, destinatario: string): Promise<void> {
  const { error } = await servicio.from('notifications').delete().eq('recipient_id', destinatario);
  if (error) throw new Error(`No se pudieron borrar las alertas: ${error.message}`);
}

/**
 * Deja el estado de salud de la sincronización en `sana` o en `caida`.
 *
 * `calendario_caido` es una de las tres alertas COMPUTADAS, y se computa sobre
 * `max(last_success_at)` de los feeds ACTIVOS: si el más reciente tiene más de
 * tres horas —o si no hay ninguno— el panel la pinta. En una base recién
 * reseteada no hay ni un feed, así que el estado por defecto es CAÍDA.
 *
 * Eso obliga a fijarlo explícitamente en los dos sentidos y no dejarlo al azar:
 * el test de escala de grises NECESITA la alerta (es uno de los siete tipos) y el
 * del contador de treinta necesita que NO esté (o serían treinta y uno). Se
 * siembra un feed propio sobre una unidad del escenario y se mueve su
 * `last_success_at`; el feed cae solo al borrar el apartamento, porque
 * `calendar_feeds.property_id` es `on delete cascade`.
 */
export async function fijarSaludDeSync(
  servicio: Servicio,
  propiedad: string,
  salud: 'sana' | 'caida',
  otrasPropiedades: string[] = [],
): Promise<void> {
  // ── SE BORRAN LOS FEEDS DE LAS OTRAS UNIDADES DEL ESCENARIO, Y NO ES CELO ──
  // El computo mira `max(last_success_at)` sobre TODOS los feeds activos, asi que
  // un feed sano que dejo un test anterior gana sobre el feed caido que este
  // acaba de sembrar y la alerta global NO aparece. El sintoma es una fila de
  // menos en el panel, en el test siguiente, sin nada que apunte a la causa.
  if (otrasPropiedades.length > 0) {
    const { error } = await servicio
      .from('calendar_feeds')
      .delete()
      .in('property_id', otrasPropiedades);
    if (error) throw new Error(`No se pudieron borrar los feeds: ${error.message}`);
  }

  // Cuatro horas es más que el umbral de tres de `UMBRAL_SYNC_CAIDA_MS`, y `now`
  // está holgadamente dentro. No se usa el borde: un test que se apoya en el
  // límite exacto falla el día que la corrida sea lenta.
  const marca = new Date(
    Date.now() - (salud === 'caida' ? 4 * 60 * 60 * 1000 : 60 * 1000),
  ).toISOString();

  const { error } = await servicio
    .from('calendar_feeds')
    .upsert(
      {
        property_id: propiedad,
        provider: 'airbnb',
        is_active: true,
        last_success_at: marca,
      },
      { onConflict: 'property_id,provider' },
    );

  if (error) throw new Error(`No se pudo fijar la salud del sync: ${error.message}`);
}

/** Un daño a sembrar. La tabla está vacía en producción hasta la Fase 6. */
export interface DanoASembrar {
  aseo: string;
  propiedad: string;
  descripcion: string;
  /** Quién lo reportó. `damages.reported_by` es NOT NULL. */
  reportadoPor: string;
  /** `true` escribe `resolved_at`. Un daño resuelto NO se oculta: lleva sufijo. */
  resuelto?: boolean;
  /** El instante del reporte, que es lo que ordena la línea de tiempo. */
  creadoEnMs: number;
}

/**
 * Siembra daños, de uno en uno y en orden.
 *
 * ── ESTO NO OCURRE SOLO TODAVÍA, Y HAY QUE DECIRLO ──────────────────────────
 * `damages` la escribe el aseador desde la PWA, que llega en la Fase 6. Hoy la
 * tabla está vacía en cualquier entorno, así que el historial mezclado de aseos
 * y daños (DASH-06, REPORT-04) solo se puede probar sembrando a mano. El nombre
 * del spec que lo hace tiene que decirlo.
 *
 * `resolved_by` no se escribe: la RPC que resuelve un daño es de la Fase 6 y
 * ponerlo aquí enmascararía un fallo suyo. El sufijo ` · Resuelto` lo decide
 * `resolved_at`, que es lo que la UI lee.
 */
export async function sembrarDanos(
  servicio: Servicio,
  filas: DanoASembrar[],
): Promise<string[]> {
  const ids: string[] = [];

  for (const fila of filas) {
    const { data, error } = await servicio
      .from('damages')
      .insert({
        cleaning_id: fila.aseo,
        property_id: fila.propiedad,
        descripcion: fila.descripcion,
        reported_by: fila.reportadoPor,
        created_at: new Date(fila.creadoEnMs).toISOString(),
        resolved_at: fila.resuelto ? new Date(fila.creadoEnMs + 3_600_000).toISOString() : null,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`No se pudo sembrar el daño «${fila.descripcion}»: ${error?.message}`);
    }
    ids.push(data.id);
  }

  return ids;
}
