import { randomUUID } from 'node:crypto';

import { clienteDeServicio } from './global-setup';
import {
  contextoPersistente,
  emularInstalada,
  esperarWorkerListo,
  expect,
  idPorEmail,
  leerCredenciales,
  registroDelWorker,
  test,
  type Servicio,
} from './fixtures';

import { construirPayload } from '@/lib/push/payload';
import { esEndpointDePush } from '@/lib/domain/suscripcion.schema';
import { CUERPO_GENERICO, TITULO_GENERICO } from '@/lib/push/sw-handlers';

/**
 * CAPA 4 DE LA FASE 5: lo que SÍ se puede automatizar del push y de la PWA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO EN VERDE NO DICE NADA SOBRE IPHONE. CERO.
 *
 * La documentación de Playwright, verbatim: los service workers *"are only
 * supported on Chromium-based browsers"*. El proyecto WebKit de este repo no
 * puede ejecutar un service worker, así que **no existe ni una sola aserción
 * automatizada sobre Safari ni sobre iOS en toda la suite**, y no es algo que
 * se arregle añadiendo un proyecto a `playwright.config.ts`.
 *
 * La entrega real en un iPhone pasa por APNs contra un dispositivo físico. Eso
 * se mide a mano, con los procedimientos M1 a M6 de `docs/matriz-dispositivos.md`,
 * y ese procedimiento manual ES el artefacto de calidad de la fase: no un
 * complemento de este archivo, sino la mitad que este archivo no alcanza.
 *
 * Si alguien lee estos seis verdes como "la fase está validada", está leyendo
 * mal, y por eso la frase está acá arriba y no en un SUMMARY.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Los seis casos son E1 a E6 de `05-RESEARCH.md` §"Capa 4: E2E". El número va
 * en el nombre de cada test para que la trazabilidad sea greppable.
 */

const servicio: Servicio = clienteDeServicio();

/** El aseador del fixture con permiso concedido. */
async function idDelAseador(): Promise<string> {
  const credenciales = leerCredenciales();
  const usuario = credenciales.aseador1;
  if (!usuario) throw new Error('No hay credenciales de `aseador1` en esta corrida.');
  return idPorEmail(servicio, usuario.email);
}

/**
 * Borra las suscripciones de ESE usuario y nada más.
 *
 * Por id y nunca por tabla: el stack local es uno solo y compartido entre
 * worktrees (regla 3 de la cabecera de siembra en `fixtures.ts`).
 */
async function limpiarSuscripciones(userId: string): Promise<void> {
  const { error } = await servicio.from('push_subscriptions').delete().eq('user_id', userId);
  if (error) throw new Error(`No se pudieron limpiar las suscripciones: ${error.message}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// E1 — el permiso concedido produce una suscripción, y queda EN LA BASE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * E1 — la suscripción del navegador termina guardada EN LA BASE.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DOS COSAS TUVIERON QUE CEDER PARA QUE ESTE CASO SEA ALCANZABLE, Y LAS DOS
 * ESTÁN MEDIDAS (2026-09-12). Si alguna se revierte, este test vuelve a rojo
 * con un error que NO dice cuál es la causa:
 *
 *   1. CONTEXTO PERSISTENTE. Todo `browser.newContext()` es incógnito, y Chrome
 *      no implementa la API de push en incógnito. El síntoma es
 *      `AbortError: Registration failed - permission denied`, con el permiso
 *      concedido y `Notification.permission === 'granted'`.
 *
 *   2. `channel: 'chrome'`, NO el Chromium empaquetado. Ese no lleva las claves
 *      de API de Google y emite un endpoint del servicio antiguo
 *      (`jmt17.google.com`) que `HOSTS_DE_PUSH` rechaza —bien rechazado—, así
 *      que la fila nunca llegaba a la base. Chrome emite `fcm.googleapis.com`,
 *      igual que un teléfono real.
 *
 * Lo que este caso NO mide, y hay que decirlo: el CLIC sobre `Activar los
 * avisos`. Con el permiso ya concedido, `usarEstadoDeAvisos` repara en silencio
 * —se suscribe y registra sola—, así que ese botón no llega a existir en el DOM.
 * El clic exige el estado de permiso `default`, y de ahí sale el diálogo NATIVO
 * del sistema, que Playwright no puede atender: concederlo desde el runner antes
 * del clic ya no mediría el gesto. Ese camino es el procedimiento manual M1.
 * ════════════════════════════════════════════════════════════════════════════
 */
test('E1 — con el permiso concedido queda UNA suscripción viva guardada en la base', async ({
  browser,
  baseURL,
}) => {
  const userId = await idDelAseador();
  await limpiarSuscripciones(userId);

  const { contexto, pagina } = await contextoPersistente(browser, 'aseador1', baseURL!);

  try {
    // Sin esto el banner se queda en S1 (`sin_instalar`) y el camino de avisos
    // no llega a ejecutarse.
    await emularInstalada(pagina);
    await pagina.goto('/mis-aseos');
    await esperarWorkerListo(pagina);

    // LA ASERCIÓN VA CONTRA LA BASE, no contra la pantalla: lo que importa no es
    // que el banner desaparezca, es que exista una fila contra la que enviar.
    await expect
      .poll(
        async () => {
          const { data } = await servicio
            .from('push_subscriptions')
            .select('endpoint')
            .eq('user_id', userId)
            .is('revoked_at', null);
          return data?.length ?? 0;
        },
        { timeout: 30_000, message: 'No apareció ninguna suscripción para el aseador' },
      )
      .toBe(1);

    const { data } = await servicio
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, revoked_at')
      .eq('user_id', userId)
      .single();

    // El endpoint es el de un servicio de push REAL, no uno fabricado: es la
    // diferencia entre medir que la app llamó a una función y medir que hay un
    // destino al que el servidor puede escribir de verdad.
    expect(esEndpointDePush(data?.endpoint ?? '')).toBe(true);
    expect(data?.p256dh).toBeTruthy();
    expect(data?.auth).toBeTruthy();
    expect(data?.revoked_at).toBeNull();

    // Y el cierre del estado: con la suscripción alineada, el banner desaparece
    // (S5 `activo`). Sin esta aserción, una suscripción guardada pero
    // desalineada con lo que el servidor conoce pasaría igual.
    await expect(pagina.getByRole('button', { name: /avisos/i })).toHaveCount(0);
  } finally {
    await contexto.close();
    await limpiarSuscripciones(userId);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2 y E3 — la entrega de verdad al service worker, por el protocolo de DevTools
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entrega un push al service worker y devuelve los títulos de lo que se mostró.
 *
 * La observación se hace con `registration.getNotifications()` DESDE la página,
 * y no espiando `showNotification` con un parche: un espía inyectado mide que
 * se llamó a una función, mientras que esto mide que la notificación existe de
 * verdad en el registro del navegador, que es la propiedad que le importa a
 * Safari cuando decide si revocar la suscripción.
 */
type Aviso = { title: string; body: string; data: unknown };

async function entregarPush(
  pagina: import('@playwright/test').Page,
  datos: string,
): Promise<Aviso[]> {
  const { cdp, registrationId, origen } = await registroDelWorker(pagina);

  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: origen,
    registrationId,
    data: datos,
  });

  // Se sondea con `expect.poll` y NO con `waitForFunction`: el predicado es
  // asíncrono, y `waitForFunction` da por buena la promesa en sí —que siempre es
  // un valor verdadero— y devuelve en el primer intento un handle vacío. Medido:
  // el test pasaba a verde sin haber leído una sola notificación.
  const resultado: Aviso[] = [];
  await expect
    .poll(
      async () => {
        const lista = await pagina.evaluate(async () => {
          const registro = await navigator.serviceWorker.ready;
          return (await registro.getNotifications()).map((n) => ({
            title: n.title,
            body: n.body,
            data: n.data as unknown,
          }));
        });
        resultado.splice(0, resultado.length, ...lista);
        return lista.length;
      },
      { timeout: 15_000, message: 'El service worker no mostró ninguna notificación' },
    )
    .toBeGreaterThan(0);

  // La bandeja se limpia acá y no en un `afterEach`: el siguiente caso mide
  // presencia, y una notificación heredada lo pondría verde sin haber entregado
  // nada.
  await pagina.evaluate(async () => {
    const registro = await navigator.serviceWorker.ready;
    for (const n of await registro.getNotifications()) n.close();
  });

  await cdp.detach();
  return resultado;
}

test('E2 — un push con el payload de producción produce la notificación real', async ({
  paginaAseadorConAvisos,
}) => {
  await emularInstalada(paginaAseadorConAvisos);
  await paginaAseadorConAvisos.goto('/mis-aseos');
  await esperarWorkerListo(paginaAseadorConAvisos);

  const idAseo = randomUUID();
  // El payload lo construye el MISMO módulo que lo construye en producción. Un
  // objeto escrito a mano acá mediría el handler contra una forma inventada.
  const origen = new URL(paginaAseadorConAvisos.url()).origin;
  const payload = construirPayload(
    {
      id: randomUUID(),
      type: 'asignacion',
      title: 'Aseo asignado',
      body: 'Mañana en Apto 301.',
      url: `/aseos/${idAseo}`,
    },
    { soportaDeclarativo: false, origen },
  );

  const avisos = await entregarPush(paginaAseadorConAvisos, payload);

  expect(avisos).toHaveLength(1);
  expect(avisos[0].title).toBe('Aseo asignado');
  expect(avisos[0].body).toBe('Mañana en Apto 301.');
  // El destino llega ABSOLUTO: `construirPayload` lo resuelve contra el origen
  // antes de emitir, y `manejarClick` lo vuelve a sanear contra ese mismo origen
  // en el dispositivo. Se afirma la forma real, no la que sería más cómoda.
  expect(avisos[0].data).toMatchObject({ url: `${origen}/aseos/${idAseo}` });
});

test('E3 — un payload que NO es JSON muestra igual una notificación', async ({
  paginaAseadorConAvisos,
}) => {
  await emularInstalada(paginaAseadorConAvisos);
  await paginaAseadorConAvisos.goto('/mis-aseos');
  await esperarWorkerListo(paginaAseadorConAvisos);

  // Es EL caso que sostiene la suscripción entera: Apple revoca el permiso del
  // sitio si un push no pinta nada. Salir del handler sin mostrar no se ve como
  // un aviso feo, se ve como una aseadora que deja de recibir todo, en silencio.
  const avisos = await entregarPush(paginaAseadorConAvisos, 'esto no es json {{{');

  expect(avisos).toHaveLength(1);
  expect(avisos[0].title).toBe(TITULO_GENERICO);
  expect(avisos[0].body).toBe(CUERPO_GENERICO);
});

// ═══════════════════════════════════════════════════════════════════════════════
// E4 — el clic reusa la ventana abierta
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PENDIENTE POR LIMITACIÓN DE LA HERRAMIENTA, NO POR ALCANCE.
 *
 * El protocolo de DevTools tiene `ServiceWorker.deliverPushMessage` y
 * `ServiceWorker.dispatchSyncEvent`, pero NO tiene ningún comando que dispare
 * `notificationclick`: no hay forma de tocar desde fuera una notificación que
 * pinta el sistema operativo.
 *
 * La salida que este plan PROHÍBE explícitamente es llamar a `manejarClick()`
 * directamente desde el test y decir que E4 está cubierto: eso es exactamente
 * lo que ya hace `lib/push/sw-handlers.test.ts`, y repetirlo acá disfrazado de
 * E2E sería cobertura falsa —la propiedad que E4 quiere medir es que el EVENTO
 * del navegador llega al handler, no que el handler haga lo correcto cuando se
 * le llama a mano.
 *
 * Queda cubierto por el procedimiento manual M2, que lo mide en el dispositivo
 * real, que es donde además importa.
 */
test.skip('E4 — el clic en el aviso reusa la ventana abierta (sin comando en el protocolo)', () => {});

// ═══════════════════════════════════════════════════════════════════════════════
// E5 y E6 — instalabilidad y frescura del worker
// ═══════════════════════════════════════════════════════════════════════════════

test('E5 — el manifest declara standalone, los dos iconos, y NO fija orientación', async ({
  request,
}) => {
  const respuesta = await request.get('/manifest.webmanifest');
  expect(respuesta.status()).toBe(200);

  const manifest = (await respuesta.json()) as {
    display?: string;
    orientation?: string;
    icons?: { sizes?: string; purpose?: string }[];
  };

  // `display` NO es estética: con el valor por defecto la API `Notification` no
  // existe en iOS, y entonces no hay suscripción, ni aviso, ni fase.
  expect(manifest.display).toBe('standalone');

  const tallas = (manifest.icons ?? []).map((i) => i.sizes);
  expect(tallas).toContain('192x192');
  expect(tallas).toContain('512x512');

  // Bloquear la orientación le quitaría a la aseadora apoyar el teléfono de lado
  // mientras trabaja. Su ausencia es una decisión, así que se afirma.
  expect(manifest.orientation).toBeUndefined();
});

test('E6 — el service worker se sirve sin caché', async ({ request }) => {
  const respuesta = await request.get('/sw.js');
  expect(respuesta.status()).toBe(200);

  // Un service worker cacheado es un service worker que no se actualiza, y acá
  // el service worker es lo ÚNICO que puede pintar un aviso.
  const control = respuesta.headers()['cache-control'] ?? '';
  expect(control).toContain('no-store');
  expect(control).toContain('must-revalidate');
});
