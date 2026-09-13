import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium, test as base, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@/lib/database.types';
import { publicEnv, readServerSecret } from '@/lib/env';

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

export function rutaStorageState(clave: string): string {
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

async function paginaConSesion(
  browser: import('@playwright/test').Browser,
  clave: string,
  // Extras del contexto. Hoy solo lo usa el fixture de avisos, para conceder el
  // permiso de notificaciones ANTES de que exista la página: `grantPermissions`
  // después de navegar deja a `Notification.permission` valiendo `'default'` en
  // el documento ya cargado, y el banner mediría el estado equivocado.
  extra: Parameters<import('@playwright/test').Browser['newContext']>[0] = {},
) {
  const destino = rutaStorageState(clave);

  if (!existsSync(destino)) {
    // Primera vez en esta corrida: se paga el login una vez y se reutiliza.
    const contextoLogin = await browser.newContext();
    const paginaLogin = await contextoLogin.newPage();
    await iniciarSesionPorUI(paginaLogin, clave);
    await contextoLogin.close();
  }

  const contexto = await browser.newContext({ storageState: destino, ...extra });
  return { contexto, pagina: await contexto.newPage() };
}

interface FixturesVivaGuest {
  /** Página con sesión de administrador ya iniciada. */
  paginaAdmin: Page;
  /** Página con sesión de aseador ya iniciada (el `aseador1` de la semilla). */
  paginaAseador: Page;
  /** Rol del usuario semilla secundario, para tests de aislamiento entre aseadores. */
  paginaAseador2: Page;
  /**
   * El aseador1, pero con el permiso de avisos YA concedido en el contexto.
   *
   * Es lo que hace alcanzable el camino de `BotonActivarAvisos`: sin el permiso
   * concedido de antemano, `Notification.requestPermission()` abriría un diálogo
   * del sistema que Playwright no puede tocar, y el test se quedaría colgado en
   * vez de fallar.
   *
   * NO emula `display-mode: standalone`: eso es por página y lo hace
   * `emularInstalada()`, porque un test que quiera medir el estado S1 (sin
   * instalar) necesita exactamente este mismo contexto sin esa emulación.
   */
  paginaAseadorConAvisos: Page;
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

  paginaAseadorConAvisos: async ({ browser }, use) => {
    const { contexto, pagina } = await paginaConSesion(browser, 'aseador1', {
      permissions: ['notifications'],
    });
    await use(pagina);
    await contexto.close();
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE SERVICE WORKER Y PWA (plan 05-17)
//
// Viven acá y no en el spec de push porque las tres dependen de detalles del
// runner —la sesión de CDP, el id de registro, la media query emulada— y no del
// caso que se esté midiendo.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Un contexto de navegador NO INCÓGNITO con la sesión de un rol ya puesta.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO EXISTE Y NO SE PUEDE USAR EL FIXTURE NORMAL. MEDIDO.
 *
 * Todo contexto de `browser.newContext()` es un contexto de incógnito, y
 * **Chrome no implementa la API de push en incógnito**. El propio navegador lo
 * dice por consola: *"Chrome currently does not support the Push API in
 * incognito mode. There is deliberately no way to feature-detect this, since
 * incognito mode needs to be undetectable by websites."*
 *
 * El síntoma NO dice incógnito por ninguna parte: `pushManager.subscribe()`
 * rechaza con `AbortError: Registration failed - permission denied`, con el
 * permiso concedido y visible en `Notification.permission === 'granted'`. Se
 * lee como un problema de permisos y no lo es.
 *
 * Un contexto persistente —el que usa un perfil en disco— no es incógnito, y
 * ahí la suscripción sale con un endpoint real del servicio de Google.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La sesión entra por cookies y no repitiendo el login por UI: esas cookies son
 * exactamente las que produjo el login real de `iniciarSesionPorUI`, así que el
 * estado es el genuino y la regla del repo —solo el test de login hace login
 * por UI— sigue en pie.
 */
export async function contextoPersistente(
  browser: import('@playwright/test').Browser,
  clave: string,
  baseURL: string,
  // ── POR QUÉ `chrome` Y NO `chromium`, MEDIDO EL 2026-09-12 ─────────────────
  // El Chromium que empaqueta Playwright NO lleva las claves de API de Google, y
  // por eso `pushManager.subscribe()` devuelve un endpoint del servicio ANTIGUO:
  // `https://jmt17.google.com/fcm/send/…`. Ese host no está en `HOSTS_DE_PUSH`
  // de `lib/domain/suscripcion.schema.ts`, así que `registrarSuscripcion` lo
  // rechaza —bien rechazado— y la fila nunca llega a la base.
  //
  // Google Chrome sí las lleva y emite `https://fcm.googleapis.com/fcm/send/…`,
  // que es lo que emite un teléfono de verdad. Requiere `npx playwright install
  // chrome` una vez en la máquina.
  canal: 'chrome' | 'chromium' = 'chrome',
): Promise<{ contexto: import('@playwright/test').BrowserContext; pagina: Page }> {
  const destino = rutaStorageState(clave);

  if (!existsSync(destino)) {
    const contextoLogin = await browser.newContext();
    const paginaLogin = await contextoLogin.newPage();
    await iniciarSesionPorUI(paginaLogin, clave);
    await contextoLogin.close();
  }

  const estado = JSON.parse(readFileSync(destino, 'utf8')) as {
    cookies: Parameters<import('@playwright/test').BrowserContext['addCookies']>[0];
  };

  const perfil = mkdtempSync(join(tmpdir(), 'vivaguest-e2e-'));
  const contexto = await chromium.launchPersistentContext(perfil, {
    channel: canal,
    permissions: ['notifications'],
    baseURL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  });
  await contexto.addCookies(estado.cookies);

  const pagina = contexto.pages()[0] ?? (await contexto.newPage());
  return { contexto, pagina };
}

/**
 * Hace que la página crea que está instalada en la pantalla de inicio.
 *
 * `estaInstalada()` de `lib/push/plataforma.ts` mira `(display-mode: standalone)`,
 * y un Chromium de escritorio abierto por Playwright siempre responde `browser`.
 * Sin esta emulación el banner se queda en S1 (`sin_instalar`) y el botón de
 * activar NO EXISTE en el DOM, así que el camino que este plan mide sería
 * inalcanzable.
 *
 * `page.emulateMedia()` no sirve: su API solo cubre `media`, `colorScheme`,
 * `reducedMotion`, `contrast` y `forcedColors`. `display-mode` solo se alcanza
 * por el protocolo de DevTools, con `Emulation.setEmulatedMedia` y su lista de
 * `features`. Chromium únicamente.
 */
export async function emularInstalada(pagina: Page): Promise<void> {
  const cdp = await pagina.context().newCDPSession(pagina);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'display-mode', value: 'standalone' }],
  });
  await cdp.detach();
}

/**
 * El identificador de registro del service worker de este origen, que es lo que
 * `ServiceWorker.deliverPushMessage` exige además del origen y los datos.
 *
 * Se obtiene suscribiéndose a `ServiceWorker.workerRegistrationUpdated`, que el
 * navegador emite al habilitar el dominio con los registros que ya existen. Es
 * decir: la página tiene que haber registrado ya su worker antes de llamar acá.
 */
export async function registroDelWorker(
  pagina: Page,
): Promise<{ cdp: import('@playwright/test').CDPSession; registrationId: string; origen: string }> {
  const cdp = await pagina.context().newCDPSession(pagina);

  const encontrado = new Promise<string>((resolver, rechazar) => {
    const temporizador = setTimeout(
      () => rechazar(new Error('El navegador no reportó ningún registro de service worker en 15s')),
      15_000,
    );
    cdp.on('ServiceWorker.workerRegistrationUpdated', (evento) => {
      const vivo = evento.registrations.find((r) => !r.isDeleted);
      if (!vivo) return;
      clearTimeout(temporizador);
      resolver(vivo.registrationId);
    });
  });

  await cdp.send('ServiceWorker.enable');
  const registrationId = await encontrado;

  const origen = new URL(pagina.url()).origin;
  return { cdp, registrationId, origen };
}

/**
 * Espera a que el service worker esté activo y controlando la página.
 *
 * `navigator.serviceWorker.ready` no basta por sí solo en la PRIMERA carga: el
 * worker puede estar activo sin controlar todavía el documento que lo registró.
 * Para entregar un push da igual, pero para medir `getNotifications()` desde la
 * página sí importa que el registro sea el mismo.
 */
export async function esperarWorkerListo(pagina: Page): Promise<void> {
  await pagina.waitForFunction(
    () => navigator.serviceWorker.controller !== null || undefined,
    undefined,
    { timeout: 20_000 },
  );
}

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
  /**
   * Instantes explícitos del ciclo de vida, en vez de los relativos a `Date.now()`.
   *
   * ── POR QUÉ HACEN FALTA, Y NO ES UN CAPRICHO DEL PLAN 07-03 ────────────────
   * Los tres por defecto se calculan como "hace cuatro / dos / una hora", que
   * sirve para sembrar el día de hoy y NO sirve para sembrar un periodo cerrado:
   * un aseo de hace mes y medio tiene que tener su `finished_at` DENTRO de ese
   * periodo, porque la pertenencia de un aseo a un periodo de pago se decide por
   * su hora de ejecución convertida a día de Bogotá (D7-5), no por su fecha
   * programada. Con el default, los cuatro aseos del periodo viejo caerían en el
   * periodo EN CURSO y el cierre saldría vacío.
   *
   * Se pasan como texto ISO con desfase explícito `-05:00`. Un `YYYY-MM-DD` a
   * secas se parsea como medianoche UTC y en Bogotá cae el día anterior, que es
   * exactamente el error de un día que `lib/domain/dates.ts` persigue.
   */
  confirmadoEn?: string;
  iniciadoEn?: string;
  terminadoEn?: string;
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
  const haceCuatroHoras = fila.confirmadoEn ?? new Date(ahora - 4 * 60 * 60 * 1000).toISOString();
  const haceDosHoras = fila.iniciadoEn ?? new Date(ahora - 2 * 60 * 60 * 1000).toISOString();
  const haceUnaHora = fila.terminadoEn ?? new Date(ahora - 60 * 60 * 1000).toISOString();

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

// ═══════════════════════════════════════════════════════════════════════════════
// SIEMBRA DEL ESCENARIO FINANCIERO (plan 07-03, Fase 7)
//
// Deja en la base lo que las specs de `finanzas.spec.ts` y `mis-pagos.spec.ts`
// necesitan y que ninguna de las dos puede sembrarse a mano sin duplicar el
// cierre: DOS periodos ya cerrados y UNO en curso.
//
// ── ESTE SEMBRADOR NO CORRE TODAVÍA, Y ESO ES EL PLAN ────────────────────────
// Nombra `public.periodo_de_cierre`, `public.cerrar_periodo`,
// `public.marcar_pago_pagado` y la tabla `public.cleaner_payouts`. Ninguno existe
// en `main`: los construyen los planes 07-04, 07-07 y 07-09. Hasta entonces la
// llamada revienta con un mensaje que dice qué falta y quién lo trae, en vez de
// con un `PGRST202` críptico. El archivo COMPILA hoy —que es lo que este plan
// exige de él— y las dos specs que lo usan nacen rojas a propósito.
//
// ── LAS TRES REGLAS DEL SEMBRADOR DE OPERACIÓN SIGUEN EN PIE ─────────────────
//   1. El día sale de la base (`today_bog()`), y los LÍMITES DE PERIODO también
//      (`periodo_de_cierre()`). Ni un literal de calendario, ni el reloj del
//      proceso. El calendario de cierre no es "el último día del mes": es el
//      último día hábil, y duplicarlo en TypeScript aquí sería una segunda
//      implementación que se desincroniza el primer mes que caiga en sábado.
//   2. Orden de borrado por clave foránea, sin excepción.
//   3. Se borra por id, nunca por tabla: el stack local es compartido.
//
// ── Y UNA CUARTA, PROPIA DE ESTA FASE ────────────────────────────────────────
// **Las dos aseadoras del escenario son los usuarios de `global-setup`**, no
// usuarios nuevos. El pago que `mis-pagos.spec.ts` tiene que ver es el del rol
// con el que esa spec abre sesión; un pago de una aseadora recién creada no
// aparecería en ninguna pantalla y el fallo apuntaría a la consulta.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Las cifras del escenario, y NO son redondas por una razón de método.
 *
 * `mis-pagos.spec.ts` afirma que ninguna cifra de huésped llega al navegador del
 * aseador, y lo afirma buscando el número dentro del cuerpo de las respuestas de
 * red. Con una tarifa de `120000` esa búsqueda daría positivos por accidente (un
 * `Content-Length`, un tamaño de bundle, un hash). Con estos seis valores, que no
 * comparten prefijo entre sí ni con ningún número frecuente, un acierto solo
 * puede venir del dato.
 *
 * `margen = tarifa - pago`, y el margen también se busca: una pantalla que no
 * mande la tarifa pero sí la resta sigue rompiendo la frontera.
 */
export const CIFRAS_FINANCIERAS = {
  /** Tarifa al huésped del apartamento A. **Prohibida en el árbol del aseador.** */
  tarifaA: 137731,
  /** Lo que se le paga a la aseadora por el apartamento A. Esto SÍ lo ve. */
  pagoA: 41117,
  /** `tarifaA - pagoA`. **Prohibido en el árbol del aseador.** */
  margenA: 96614,

  tarifaB: 152909,
  pagoB: 48211,
  margenB: 104698,

  /** El gasto reembolsado del periodo reciente. Esto SÍ lo ve el aseador. */
  gasto: 33517,
} as const;

/** Un periodo de pago, de cierre a cierre. Las dos fechas son reales (D7-5). */
export interface PeriodoDePago {
  desde: string;
  hasta: string;
}

/** Lo que `sembrarFinanzas()` deja en la base y `limpiarFinanzas()` borra. */
export interface EscenarioFinanciero {
  /** Gestionada, con `tarifaA` / `pagoA`. */
  aptoA: UnidadSembrada;
  /** Gestionada, con `tarifaB` / `pagoB`. Tarifas DISTINTAS a propósito: sin eso, el margen por fila no se distingue de una constante. */
  aptoB: UnidadSembrada;
  /** `gestion_vivaguest = false`. No puede aparecer en ningún número ni en el combobox (FIN-05). */
  externa: UnidadSembrada;

  /** `aseador1` de la semilla. Es con quien `mis-pagos.spec.ts` abre sesión. */
  aseadoraUna: AseadoraSembrada;
  /** `aseador2`. Su pago es el que el aseador1 NO puede ver. */
  aseadoraDos: AseadoraSembrada;

  /** El periodo que contiene hoy. **Sin cerrar.** El aseador no lo ve (D7-4.3). */
  enCurso: PeriodoDePago;
  /** El cerrado más reciente. Pago de la Una PENDIENTE, pago de la Dos PAGADO. */
  reciente: PeriodoDePago;
  /** El cerrado más antiguo. Pago de la Una PAGADO. */
  viejo: PeriodoDePago;

  /** El aseo cuya fecha programada y cuya fecha de ejecución caen en periodos DISTINTOS (D7-8). */
  aseoCruzado: {
    id: string;
    /** Cae en el último día del periodo `viejo`. */
    programado: string;
    /** Cae dentro del periodo `reciente`. Es el que decide en qué pago entra. */
    hecho: string;
  };

  /** El aseo cuyas dos fechas COINCIDEN. La línea de las dos fechas tiene que salir igual. */
  aseoAlineado: { id: string; fecha: string };

  /** El gasto del periodo `reciente`, con su fila de foto de recibo. */
  gasto: { id: string; concepto: string; fotoId: string };

  /** Los ids de los aseos sembrados, para la limpieza y para poder afirmar conteos. */
  aseos: string[];

  sufijo: string;
}

/**
 * Un cliente de Supabase SIN el genérico `Database`, para hablar con lo que
 * todavía no está en `lib/database.types.ts`.
 *
 * ── POR QUÉ NO SE EDITA `lib/database.types.ts` A MANO ───────────────────────
 * Ese archivo lo genera el CLI y la puerta `db:types:check` de CI compara la
 * generación contra el disco: añadirle a mano las tres tablas de la Fase 7 pone
 * esa puerta en rojo hasta que la migración exista, y el rojo no diría nada útil.
 * El plan 07-04 lo regenera; cuando eso pase, este cliente puede desaparecer y
 * las llamadas de abajo pasan a tiparse solas.
 *
 * El alcance es lo más estrecho posible: solo lo usan las cuatro llamadas de este
 * bloque. Todo lo demás del archivo sigue yendo por el cliente tipado.
 */
function clienteSinTipar(url: string, clave: string) {
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** El cliente de servicio, sin el genérico. Mismo secreto, mismos privilegios. */
function servicioSinTipar() {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();
  return clienteSinTipar(NEXT_PUBLIC_SUPABASE_URL, readServerSecret('SUPABASE_SECRET_KEY'));
}

/**
 * Un cliente con la sesión REAL del admin de la semilla.
 *
 * ── POR QUÉ EL CIERRE NO SE HACE CON EL CLIENTE DE SERVICIO ──────────────────
 * `public.cerrar_periodo` es `security definer` con guarda `private.is_admin()`,
 * que resuelve `auth.uid()` contra `profiles`. La clave de servicio no tiene
 * `auth.uid()`, así que la guarda diría que no y el sembrador tendría que
 * insertar las filas del snapshot A MANO, columna por columna. Eso sería peor que
 * lento: sembraría un periodo cerrado que la función de cierre nunca produjo, y
 * las specs afirmarían sobre datos que el sistema no sabe generar.
 *
 * Con una sesión de admin de verdad, el escenario que las specs ven es
 * exactamente el que produce el camino de producción.
 */
async function clienteComoAdmin() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();
  const credenciales = leerCredenciales();
  const admin = credenciales.admin;
  if (!admin) throw new Error('No hay credenciales de admin en la corrida.');

  const cliente = clienteSinTipar(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const { error } = await cliente.auth.signInWithPassword({
    email: admin.email,
    password: admin.password,
  });
  if (error) throw new Error(`No se pudo abrir sesión de admin para sembrar: ${error.message}`);
  return cliente;
}

/**
 * El periodo de pago que contiene un día, PREGUNTÁNDOSELO A LA BASE.
 *
 * `public.periodo_de_cierre(date)` devuelve una fila con las dos fechas. Lo
 * construye el plan 07-04; hasta entonces esto lanza con un mensaje que dice
 * quién lo trae.
 */
async function periodoDeCierre(dia: string): Promise<PeriodoDePago> {
  const { data, error } = await servicioSinTipar().rpc('periodo_de_cierre', { p_dia: dia });
  if (error) {
    throw new Error(
      `No se pudo resolver el periodo de ${dia}: ${error.message}\n` +
        'Si dice que la función no existe, es lo esperado hasta el plan 07-04: ' +
        'public.periodo_de_cierre(date) todavía no está en ninguna migración.',
    );
  }

  const filas = (data ?? []) as { periodo_desde: string; periodo_hasta: string }[];
  const fila = filas[0];
  if (!fila) throw new Error(`periodo_de_cierre(${dia}) no devolvió ninguna fila.`);
  return { desde: fila.periodo_desde, hasta: fila.periodo_hasta };
}

/** Un instante de Bogotá a partir de un día de negocio y una hora del reloj. */
function instanteBog(dia: string, hora: string): string {
  return `${dia}T${hora}:00-05:00`;
}

/**
 * Siembra dos periodos cerrados, uno en curso, y el cierre ya ejecutado.
 *
 * Lo que deja, y cada pieza está aquí porque una aserción la necesita:
 *
 * | Pieza | La aserción que la necesita |
 * |---|---|
 * | Dos gestionadas con tarifas distintas | El margen por fila no puede ser una constante disfrazada |
 * | Una de gestión externa | FIN-05: no aparece ni en la tabla, ni en el combobox, ni en los totales |
 * | Un aseo con fechas en periodos distintos | D7-8: la línea `Programado … · Hecho …` con las dos fechas de verdad |
 * | Un aseo con las dos fechas iguales | D7-8 otra vez, en el caso que tienta a abreviar |
 * | Un gasto con su foto de recibo | El desglose abre el recibo; la columna `GASTOS` no es `$ 0` |
 * | Un daño | La fila `Con daños` del bloque 2, y la línea de que no se descuenta |
 * | Un periodo en curso con aseos | D7-4.3: el aseador NO lo ve |
 * | Un pago pagado y otro pendiente | Las dos columnas de estado de la tabla de pagos |
 */
export async function sembrarFinanzas(servicio: Servicio): Promise<EscenarioFinanciero> {
  const sufijo = randomUUID().slice(0, 8);
  const hoy = await diaDeNegocio(servicio);
  const credenciales = leerCredenciales();

  // Las dos aseadoras SON las de la semilla. Ver la cuarta regla de la cabecera.
  const aseadoraUna: AseadoraSembrada = {
    id: await idPorEmail(servicio, credenciales.aseador1.email),
    nombre: 'Aseador Uno E2E',
  };
  const aseadoraDos: AseadoraSembrada = {
    id: await idPorEmail(servicio, credenciales.aseador2.email),
    nombre: 'Aseador Dos E2E',
  };

  // ── LOS TRES PERIODOS, TODOS DERIVADOS DE LA BASE ─────────────────────────
  // Se encadenan hacia atrás restando UN día a `desde`: el día anterior al
  // comienzo de un periodo es, por definición de D7-5, el día de cierre del
  // anterior, y dos periodos consecutivos son contiguos y no se solapan.
  const enCurso = await periodoDeCierre(hoy);
  const reciente = await periodoDeCierre(sumarDias(enCurso.desde, -1));
  const viejo = await periodoDeCierre(sumarDias(reciente.desde, -1));

  const aptoA = await crearUnidadFinanciera(
    servicio,
    `E2E Fin Bogota ${sufijo}`,
    sufijo,
    aseadoraUna.id,
    aseadoraDos.id,
    CIFRAS_FINANCIERAS.tarifaA,
    CIFRAS_FINANCIERAS.pagoA,
  );
  const aptoB = await crearUnidadFinanciera(
    servicio,
    `E2E Fin Medellin ${sufijo}`,
    sufijo,
    aseadoraUna.id,
    aseadoraDos.id,
    CIFRAS_FINANCIERAS.tarifaB,
    CIFRAS_FINANCIERAS.pagoB,
  );

  const { data: externa, error: errorExterna } = await servicio
    .from('properties')
    .insert({
      nombre: `E2E Fin Externa ${sufijo}`,
      cluster: `E2E Fin ${sufijo}`,
      gestion_vivaguest: false,
      contacto_externo: `Administración Externa ${sufijo}`,
      is_active: true,
    })
    .select('id, nombre')
    .single();
  if (errorExterna || !externa) {
    throw new Error(`No se pudo sembrar la unidad externa: ${errorExterna?.message}`);
  }

  // ── LOS DÍAS DE CADA ASEO ────────────────────────────────────────────────
  // Días DISTINTOS por apartamento dentro de cada periodo: el índice único
  // parcial `(property_id, scheduled_date) where estado <> 'cancelado'` deja un
  // solo aseo activo por apartamento y fecha, y una colisión aquí se lee como un
  // fallo del sembrador tres archivos más allá.
  const diaViejo = viejo.desde;
  const diaCruzadoProgramado = viejo.hasta; // último día del periodo viejo
  const diaCruzadoHecho = sumarDias(reciente.desde, 1); // ya dentro del reciente
  const diaAlineado = sumarDias(reciente.desde, 2);
  const diaDeLaDos = sumarDias(reciente.desde, 3);
  const diaExterno = sumarDias(reciente.desde, 4);

  const completado = (dia: string, aseador: string) => ({
    estado: 'completada' as const,
    aseador,
    confirmadoEn: instanteBog(dia, '07:00'),
    iniciadoEn: instanteBog(dia, '09:00'),
    terminadoEn: instanteBog(dia, '11:30'),
    huespedes: 2,
  });

  // El aseo del periodo VIEJO: es lo que hace que ese periodo tenga un pago que
  // cerrar. Sin él, `cerrar_periodo` dejaría una cabecera sin pagos y la tarjeta
  // pagada del teléfono no existiría.
  const [aseoViejo] = await sembrarAseos(servicio, [
    { propiedad: aptoA.id, fecha: diaViejo, ...completado(diaViejo, aseadoraUna.id) },
  ]);

  // Los del periodo RECIENTE.
  const [aseoCruzadoId, aseoAlineadoId, aseoDeLaDos] = await sembrarAseos(servicio, [
    // ── EL ASEO QUE HACE VISIBLE D7-8 ────────────────────────────────────────
    // Programado el último día del periodo viejo, ejecutado ya dentro del
    // reciente. Es el que se paga en el periodo del 2 y no en el del 28, y es la
    // única razón por la que la línea de las dos fechas existe. Sin él, la
    // aserción de D7-8 pasaría con las dos fechas iguales y no probaría nada.
    {
      propiedad: aptoA.id,
      fecha: diaCruzadoProgramado,
      ...completado(diaCruzadoHecho, aseadoraUna.id),
    },
    // Y su contraparte: las dos fechas coinciden. La línea tiene que salir IGUAL.
    { propiedad: aptoB.id, fecha: diaAlineado, ...completado(diaAlineado, aseadoraUna.id) },
    // El de la otra aseadora, que es el pago que el aseador1 no puede ver.
    { propiedad: aptoB.id, fecha: diaDeLaDos, ...completado(diaDeLaDos, aseadoraDos.id) },
  ]);

  // El de gestión externa: nace INERTE por CHECK (`cl_unmanaged_is_inert`), así
  // que no se le pasa ni estado ni aseador ni instantes. Parte de FIN-05 sale de
  // ahí sola; lo que las specs miden es que tampoco aparezca en pantalla.
  const [aseoExterno] = await sembrarAseos(servicio, [
    { propiedad: externa.id, fecha: diaExterno },
  ]);

  // El periodo EN CURSO, con un aseo completado de la aseadora Una. Es lo que el
  // teléfono NO puede mostrar (D7-4.3): un acumulado que todavía puede bajar.
  const [aseoEnCurso] = await sembrarAseos(servicio, [
    { propiedad: aptoA.id, fecha: hoy, ...completado(hoy, aseadoraUna.id) },
  ]);

  // ── EL GASTO Y SU RECIBO ─────────────────────────────────────────────────
  const concepto = `Jabón y trapos ${sufijo}`;
  const { data: gasto, error: errorGasto } = await servicio
    .from('expenses')
    .insert({
      cleaning_id: aseoCruzadoId,
      property_id: aptoA.id,
      concepto,
      monto: CIFRAS_FINANCIERAS.gasto,
      reported_by: aseadoraUna.id,
      created_at: instanteBog(diaCruzadoHecho, '11:00'),
    })
    .select('id')
    .single();
  if (errorGasto || !gasto) {
    throw new Error(`No se pudo sembrar el gasto: ${errorGasto?.message}`);
  }

  // La ruta la impone un CHECK de la migración 10:
  // `starts_with(storage_path, cleaning_id || '/' || kind || '/')`.
  const { data: foto, error: errorFoto } = await servicio
    .from('cleaning_photos')
    .insert({
      cleaning_id: aseoCruzadoId,
      kind: 'gasto',
      expense_id: gasto.id,
      storage_path: `${aseoCruzadoId}/gasto/recibo-${sufijo}.jpg`,
      mime_type: 'image/jpeg',
      bytes: 1024,
      uploaded_by: aseadoraUna.id,
    })
    .select('id')
    .single();
  if (errorFoto || !foto) {
    throw new Error(`No se pudo sembrar la foto del recibo: ${errorFoto?.message}`);
  }

  // ── EL DAÑO ──────────────────────────────────────────────────────────────
  // Igual que en `historial.spec.ts`: hoy nadie escribe `damages` fuera de la PWA
  // del aseador, así que la fila `Con daños` del bloque 2 solo se puede ejercer
  // sembrando a mano. Queda dicho para que nadie lea el verde como "esto ocurre".
  await sembrarDanos(servicio, [
    {
      aseo: aseoAlineadoId,
      propiedad: aptoB.id,
      descripcion: `Se rompió la ducha ${sufijo}`,
      reportadoPor: aseadoraUna.id,
      creadoEnMs: Date.parse(instanteBog(diaAlineado, '12:00')),
    },
  ]);

  // ── EL CIERRE, EN ORDEN CRONOLÓGICO ──────────────────────────────────────
  // Del viejo al reciente, que es el orden en que ocurre en producción. Al revés
  // no daría el mismo resultado si algún día el cierre mirara el periodo anterior.
  const admin = await clienteComoAdmin();
  await cerrarPeriodo(admin, viejo);
  await cerrarPeriodo(admin, reciente);

  // ── LOS DOS ESTADOS DE PAGO ──────────────────────────────────────────────
  // El pago del periodo viejo de la aseadora Una: PAGADO. El del reciente:
  // PENDIENTE. Y el del reciente de la aseadora Dos: PAGADO. Con eso, la tabla
  // del admin tiene las dos columnas de estado dentro de UN mismo bloque de
  // periodo, y el teléfono de la Una tiene una tarjeta de cada clase.
  await marcarPagado(admin, viejo, aseadoraUna.id);
  await marcarPagado(admin, reciente, aseadoraDos.id);
  await admin.auth.signOut();

  return {
    aptoA,
    aptoB,
    externa,
    aseadoraUna,
    aseadoraDos,
    enCurso,
    reciente,
    viejo,
    aseoCruzado: {
      id: aseoCruzadoId,
      programado: diaCruzadoProgramado,
      hecho: diaCruzadoHecho,
    },
    aseoAlineado: { id: aseoAlineadoId, fecha: diaAlineado },
    gasto: { id: gasto.id, concepto, fotoId: foto.id },
    aseos: [aseoViejo, aseoCruzadoId, aseoAlineadoId, aseoDeLaDos, aseoExterno, aseoEnCurso],
    sufijo,
  };
}

/** Una gestionada con tarifas explícitas. Ver `crearUnidadGestionada` para el resto. */
async function crearUnidadFinanciera(
  servicio: Servicio,
  nombre: string,
  sufijo: string,
  responsable: string,
  suplente: string,
  tarifa: number,
  pago: number,
): Promise<UnidadSembrada> {
  const { data, error } = await servicio
    .from('properties')
    .insert({
      nombre,
      cluster: `E2E Fin ${sufijo}`,
      gestion_vivaguest: true,
      hora_limite: '10:15',
      tarifa_huesped: tarifa,
      pago_aseador: pago,
      responsable_id: responsable,
      suplente_id: suplente,
      is_active: true,
    })
    .select('id, nombre')
    .single();

  if (error || !data) throw new Error(`No se pudo sembrar ${nombre}: ${error?.message}`);
  return data;
}

/** Invoca el cierre real, con sesión de admin. Lo construye el plan 07-07. */
async function cerrarPeriodo(
  admin: ReturnType<typeof clienteSinTipar>,
  periodo: PeriodoDePago,
): Promise<void> {
  // Los nombres de los argumentos son el ÚNICO acoplamiento de este archivo con
  // la firma de 07-07. Si allá se llaman distinto, se cambia AQUÍ y en ningún
  // otro sitio.
  const { error } = await admin.rpc('cerrar_periodo', {
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
  });
  if (error) {
    throw new Error(
      `No se pudo cerrar el periodo ${periodo.desde}…${periodo.hasta}: ${error.message}\n` +
        'Si dice que la función no existe, es lo esperado hasta el plan 07-07.',
    );
  }
}

/**
 * Marca como pagado el pago de una persona en un periodo, por el camino real.
 *
 * El id del pago se busca con el cliente de SERVICIO (las tres tablas del
 * snapshot no tienen grant para `authenticated`: todo sale por función), y la
 * marca se pone con la sesión de ADMIN, que es quien pasa la guarda de
 * `marcar_pago_pagado`. Los dos clientes hacen falta y ninguno sustituye al otro.
 */
async function marcarPagado(
  admin: ReturnType<typeof clienteSinTipar>,
  periodo: PeriodoDePago,
  aseadora: string,
): Promise<void> {
  const { data, error } = await servicioSinTipar()
    .from('cleaner_payouts')
    .select('id')
    .eq('periodo_desde', periodo.desde)
    .eq('aseador_id', aseadora)
    .single();

  if (error || !data) {
    throw new Error(
      `No hay pago de ${aseadora} en el periodo ${periodo.desde}: ${error?.message ?? 'sin fila'}\n` +
        'Si dice que la relación no existe, es lo esperado hasta el plan 07-04.',
    );
  }

  const pago = data as { id: string };
  const { error: errorMarca } = await admin.rpc('marcar_pago_pagado', { p_pago: pago.id });
  if (errorMarca) {
    throw new Error(
      `No se pudo marcar pagado ${pago.id}: ${errorMarca.message}\n` +
        'Si dice que la función no existe, es lo esperado hasta el plan 07-09.',
    );
  }
}

/**
 * Borra lo que sembró `sembrarFinanzas()`, EN ORDEN DE CLAVE FORÁNEA.
 *
 * ── LO QUE PASA SI ESTO NO CORRE, Y ES PEOR QUE DEJAR BASURA ─────────────────
 * La lista de `/finanzas/pagos` es ACUMULATIVA: un periodo cerrado de una corrida
 * anterior sigue ahí y se pinta como un bloque más. La aserción de "solo el más
 * reciente viene desplegado" empezaría a mirar el bloque equivocado, y el vacío
 * `Todavía no se ha cerrado ningún periodo.` no volvería a aparecer nunca. El
 * síntoma es una spec que pasa sola y falla dentro de la suite, que es la clase
 * de fallo que más caro sale de diagnosticar.
 *
 * Los usuarios NO se borran: son los de `global-setup`, compartidos con el resto
 * de la suite, y los borra el teardown global al final de la corrida.
 */
export async function limpiarFinanzas(
  servicio: Servicio,
  escenario: EscenarioFinanciero,
): Promise<void> {
  const crudo = servicioSinTipar();
  const periodos = [escenario.viejo.desde, escenario.reciente.desde];

  // 1. Las líneas del desglose. Cuelgan del pago con cascada DENTRO del
  //    snapshot, pero se borran explícitamente: si algún día la cascada se
  //    revisa, esto sigue limpiando.
  const pagos = await crudo.from('cleaner_payouts').select('id').in('periodo_desde', periodos);
  const idsDePago = ((pagos.data ?? []) as { id: string }[]).map((p) => p.id);
  if (idsDePago.length > 0) {
    await crudo.from('cleaner_payout_lines').delete().in('payout_id', idsDePago);
  }

  // 2. Los pagos, y 3. la cabecera de periodo. En ese orden: la referencia del
  //    pago a la cabecera es de borrado RESTRINGIDO, a propósito (07-04).
  await crudo.from('cleaner_payouts').delete().in('periodo_desde', periodos);
  await crudo.from('payout_periods').delete().in('periodo_desde', periodos);

  // 4. Los aseos. Gastos, fotos y daños caen por cascada desde aquí. Se borran
  //    POR APARTAMENTO y no por la lista de ids: un aseo que haya creado un test
  //    pulsando un botón no está en ninguna lista, y bloquearía el paso 5.
  const propiedades = [escenario.aptoA.id, escenario.aptoB.id, escenario.externa.id];
  const aseos = await servicio.from('cleanings').delete().in('property_id', propiedades);
  if (aseos.error) throw new Error(`No se pudieron borrar los aseos: ${aseos.error.message}`);

  // 5. Los apartamentos.
  const props = await servicio.from('properties').delete().in('id', propiedades);
  if (props.error) throw new Error(`No se pudieron borrar los apartamentos: ${props.error.message}`);
}
