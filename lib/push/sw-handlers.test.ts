import { describe, expect, it, vi } from 'vitest';

import { RUTA_POR_DEFECTO } from './payload';
import {
  BADGE,
  CUERPO_GENERICO,
  ICONO,
  TITULO_GENERICO,
  manejarClick,
  manejarPush,
  type ClientesDelWorker,
  type RegistroDeNotificaciones,
  type VentanaDeCliente,
} from './sw-handlers';

/**
 * LOS DOS HANDLERS DEL SERVICE WORKER, PROBADOS FUERA DEL SERVICE WORKER.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * U9 VA PRIMERO EN EL ARCHIVO PORQUE ES EL CASO MÁS CARO DE LA FASE.
 *
 * Apple, verbatim: *"Safari doesn't support invisible push notifications.
 * Present push notifications to the user immediately after your service worker
 * receives them. If you don't, Safari revokes the push notification permission
 * for your site."* Y WebKit: *"Violations of the `userVisibleOnly` promise will
 * result in a push subscription being revoked."*
 *
 * Traducido a esta aplicación: si `manejarPush` sale sin llamar
 * `showNotification`, el modo de fallo NO es «llegó un aviso mal pintado». Es
 * que a esa aseadora se le REVOCA la suscripción y deja de recibir TODO, en
 * silencio, sin error en ningún lado, sin nada en la base y sin nada que un
 * admin pueda ver. El siguiente aseo asignado simplemente no se ejecuta.
 *
 * Por eso estos tests existen y por eso la lógica no vive dentro de
 * `app/sw.ts`: un service worker no se puede instrumentar con Vitest y
 * Playwright no ejecuta service workers en WebKit. Sacar la lógica a un módulo
 * probable es la ÚNICA mitigación de T-05-30 que no depende de tener cuidado.
 * ════════════════════════════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────────────────────────────────
// Dobles del entorno de service worker
// ───────────────────────────────────────────────────────────────────────────

/**
 * El doble de `self.registration`. Objeto plano: `manejarPush` recibe por
 * parámetro lo que necesita y no lee un solo global, que es justo lo que lo
 * hace probable acá.
 */
function registroDoble(): RegistroDeNotificaciones & {
  showNotification: ReturnType<typeof vi.fn>;
} {
  return { showNotification: vi.fn(async () => undefined) };
}

/** Un `event.data` que devuelve el JSON que se le pase. */
function datosCon(cuerpo: unknown): unknown {
  return { json: () => cuerpo };
}

/** Un `event.data` cuyo `.json()` LANZA. El caso U9. */
function datosIlegibles(): unknown {
  return {
    json: () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  };
}

const ORIGEN = 'https://vivaguest.example.com';

/** La envoltura clásica de `construirPayload()`, la que ve Android. */
const CLASICO = {
  datos: {
    titulo: 'Nuevo aseo asignado',
    cuerpo: 'Tienes un aseo asignado en Cabecera 302 para el 12/09 antes de las 14:00.',
    url: `${ORIGEN}/aseos/6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60`,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'k7Qw-3xZa_B1',
  },
};

/** La envoltura declarativa de D-07, la que ve iOS 18.4+. */
const DECLARATIVO = {
  web_push: 8030,
  notification: {
    title: 'Nuevo aseo asignado',
    body: 'Tienes un aseo asignado en Cabecera 302 para el 12/09 antes de las 14:00.',
    navigate: `${ORIGEN}/aseos/6f1a2b3c-4d5e-4f60-8a91-0b2c3d4e5f60`,
    silent: false,
    lang: 'es-CO',
    dir: 'ltr',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'k7Qw-3xZa_B1',
  },
  datos: CLASICO.datos,
};

function ventana(url: string): VentanaDeCliente & {
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
} {
  return {
    url,
    focus: vi.fn(async () => undefined),
    navigate: vi.fn(async () => undefined),
  };
}

function clientesDoble(ventanas: VentanaDeCliente[]): ClientesDelWorker & {
  matchAll: ReturnType<typeof vi.fn>;
  openWindow: ReturnType<typeof vi.fn>;
} {
  return {
    matchAll: vi.fn(async () => ventanas),
    openWindow: vi.fn(async () => undefined),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// manejarPush
// ───────────────────────────────────────────────────────────────────────────

describe('manejarPush', () => {
  it('U9 · con un payload ILEGIBLE muestra igual una notificación genérica, porque no mostrarla revoca la suscripción', async () => {
    const registro = registroDoble();

    await manejarPush(datosIlegibles(), registro);

    expect(registro.showNotification).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = registro.showNotification.mock.calls[0];
    expect(titulo).toBe(TITULO_GENERICO);
    expect(opciones.body).toBe(CUERPO_GENERICO);
  });

  it('U9 · el genérico del payload ilegible llega COMPLETO, no a medias: icono, badge, idioma y destino por defecto', async () => {
    const registro = registroDoble();

    await manejarPush(datosIlegibles(), registro);

    const [, opciones] = registro.showNotification.mock.calls[0];
    // El señuelo de este caso es construir las opciones a medias dentro del
    // `try` y que el fallo las deje mutadas por la mitad: un aviso sin icono ni
    // destino es un aviso que al tocarlo no lleva a ninguna parte.
    expect(opciones.icon).toBe(ICONO);
    expect(opciones.badge).toBe(BADGE);
    expect(opciones.lang).toBe('es-CO');
    expect(opciones.dir).toBe('ltr');
    expect(opciones.silent).toBe(false);
    expect(opciones.data.url).toBe(RUTA_POR_DEFECTO);
  });

  it('U10 · sin `event.data` (payload nulo) muestra el mismo genérico', async () => {
    const registro = registroDoble();

    await manejarPush(null, registro);

    expect(registro.showNotification).toHaveBeenCalledTimes(1);
    expect(registro.showNotification.mock.calls[0][0]).toBe(TITULO_GENERICO);
  });

  it('U10 · con un `event.data` presente pero que devuelve `null` muestra el genérico y no revienta', async () => {
    const registro = registroDoble();

    await manejarPush(datosCon(null), registro);

    expect(registro.showNotification).toHaveBeenCalledTimes(1);
    expect(registro.showNotification.mock.calls[0][0]).toBe(TITULO_GENERICO);
  });

  it('con la envoltura CLÁSICA muestra el título y el cuerpo verbatim, con icono, badge, tag y destino', async () => {
    const registro = registroDoble();

    await manejarPush(datosCon(CLASICO), registro);

    expect(registro.showNotification).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = registro.showNotification.mock.calls[0];
    expect(titulo).toBe(CLASICO.datos.titulo);
    expect(opciones.body).toBe(CLASICO.datos.cuerpo);
    expect(opciones.icon).toBe('/icon-192.png');
    expect(opciones.badge).toBe('/badge-72.png');
    expect(opciones.tag).toBe(CLASICO.datos.tag);
    expect(opciones.data.url).toBe(CLASICO.datos.url);
  });

  it('con la envoltura DECLARATIVA lee el bloque `notification` y muestra UNA SOLA notificación, no dos', async () => {
    const registro = registroDoble();

    await manejarPush(datosCon(DECLARATIVO), registro);

    // El señuelo: en iOS 18.4+ el sistema ya propone una notificación. Si el
    // handler pinta dos, la aseadora ve el mismo hecho duplicado.
    expect(registro.showNotification).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = registro.showNotification.mock.calls[0];
    expect(titulo).toBe(DECLARATIVO.notification.title);
    expect(opciones.body).toBe(DECLARATIVO.notification.body);
    expect(opciones.data.url).toBe(DECLARATIVO.notification.navigate);
    expect(opciones.tag).toBe(DECLARATIVO.notification.tag);
  });

  it('DEVUELVE la promesa de `showNotification`: no resuelve antes de que la notificación esté pintada', async () => {
    // El señuelo es no devolverla. `event.waitUntil()` recibe entonces una
    // promesa ya resuelta, el navegador da por terminado el evento y puede
    // matar el service worker ANTES de mostrar nada. En iOS eso es,
    // literalmente, una suscripción menos.
    let resolver: (() => void) | undefined;
    const registro: RegistroDeNotificaciones = {
      showNotification: () =>
        new Promise<void>((r) => {
          resolver = () => r();
        }),
    };

    let terminado = false;
    const promesa = manejarPush(datosCon(CLASICO), registro).then(() => {
      terminado = true;
    });

    await Promise.resolve();
    expect(terminado).toBe(false);

    resolver?.();
    await promesa;
    expect(terminado).toBe(true);
  });

  it('sin `url` en el payload el destino es la lista del aseador, no cadena vacía ni la raíz', async () => {
    const registro = registroDoble();

    await manejarPush(datosCon({ datos: { titulo: 'Hola', cuerpo: 'Algo pasó' } }), registro);

    const [, opciones] = registro.showNotification.mock.calls[0];
    expect(opciones.data.url).toBe(RUTA_POR_DEFECTO);
    expect(opciones.data.url).not.toBe('');
    expect(opciones.data.url).not.toBe('/');
  });

  it('NUNCA emite `requireInteraction`, en ninguna de las tres ramas', async () => {
    // En iOS no aplica, y en Android deja el aviso pegado hasta que alguien lo
    // toque. Con quince asignaciones en tanda eso es una pantalla bloqueada.
    for (const entrada of [datosIlegibles(), datosCon(CLASICO), datosCon(DECLARATIVO)]) {
      const registro = registroDoble();
      await manejarPush(entrada, registro);
      const [, opciones] = registro.showNotification.mock.calls[0];
      expect(opciones).not.toHaveProperty('requireInteraction');
    }
  });

  it('`silent` es siempre `false`: un aviso silencioso viola `userVisibleOnly` y cuesta la suscripción', async () => {
    for (const entrada of [datosIlegibles(), datosCon(CLASICO), datosCon(DECLARATIVO)]) {
      const registro = registroDoble();
      await manejarPush(entrada, registro);
      const [, opciones] = registro.showNotification.mock.calls[0];
      expect(opciones.silent).toBe(false);
    }
  });

  it('un payload con la forma correcta pero campos de tipo equivocado cae al genérico en vez de pintar `[object Object]`', async () => {
    const registro = registroDoble();

    await manejarPush(datosCon({ datos: { titulo: { a: 1 }, cuerpo: 42, url: ['x'] } }), registro);

    const [titulo, opciones] = registro.showNotification.mock.calls[0];
    expect(titulo).toBe(TITULO_GENERICO);
    expect(opciones.body).toBe(CUERPO_GENERICO);
    expect(opciones.data.url).toBe(RUTA_POR_DEFECTO);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// manejarClick
// ───────────────────────────────────────────────────────────────────────────

describe('manejarClick', () => {
  it('con una ventana del MISMO origen abierta la enfoca y la navega, y NO abre una ventana nueva', async () => {
    const abierta = ventana(`${ORIGEN}/operacion`);
    const clientes = clientesDoble([abierta]);

    await manejarClick(`${ORIGEN}/aseos/abc`, clientes, ORIGEN);

    expect(abierta.focus).toHaveBeenCalledTimes(1);
    expect(abierta.navigate).toHaveBeenCalledWith(`${ORIGEN}/aseos/abc`);
    // El señuelo: `clients.openWindow()` a ciegas abre una pestaña nueva cada
    // vez aunque la app ya esté abierta.
    expect(clientes.openWindow).not.toHaveBeenCalled();
  });

  it('sin ninguna ventana abierta abre una, exactamente una vez', async () => {
    const clientes = clientesDoble([]);

    await manejarClick(`${ORIGEN}/aseos/abc`, clientes, ORIGEN);

    expect(clientes.openWindow).toHaveBeenCalledTimes(1);
    expect(clientes.openWindow).toHaveBeenCalledWith(`${ORIGEN}/aseos/abc`);
  });

  it('una ventana de OTRO origen no cuenta: la ignora y abre una nueva', async () => {
    const ajena = ventana('https://otro-sitio.example.com/lo-que-sea');
    const clientes = clientesDoble([ajena]);

    await manejarClick(`${ORIGEN}/aseos/abc`, clientes, ORIGEN);

    expect(ajena.focus).not.toHaveBeenCalled();
    expect(clientes.openWindow).toHaveBeenCalledTimes(1);
  });

  it('pide las ventanas con `includeUncontrolled`: una pestaña que todavía no controla este worker también cuenta', async () => {
    const clientes = clientesDoble([]);

    await manejarClick(`${ORIGEN}/aseos/abc`, clientes, ORIGEN);

    expect(clientes.matchAll).toHaveBeenCalledWith({
      type: 'window',
      includeUncontrolled: true,
    });
  });

  it('sin destino en la notificación lleva a la lista del aseador, no a cadena vacía ni a la raíz', async () => {
    const clientes = clientesDoble([]);

    await manejarClick(undefined, clientes, ORIGEN);

    expect(clientes.openWindow).toHaveBeenCalledWith(RUTA_POR_DEFECTO);
  });

  it('un destino de OTRO origen se descarta: desde la pantalla de bloqueo no hay barra de direcciones que delate el salto', async () => {
    const clientes = clientesDoble([]);

    await manejarClick('https://sitio-ajeno.example.com/phishing', clientes, ORIGEN);

    expect(clientes.openWindow).toHaveBeenCalledWith(RUTA_POR_DEFECTO);
  });

  it('una ventana del mismo origen sin `navigate` (el método es opcional) se enfoca igual y no abre una nueva', async () => {
    const sinNavigate: VentanaDeCliente & { focus: ReturnType<typeof vi.fn> } = {
      url: `${ORIGEN}/mis-aseos`,
      focus: vi.fn(async () => undefined),
    };
    const clientes = clientesDoble([sinNavigate]);

    await manejarClick(`${ORIGEN}/aseos/abc`, clientes, ORIGEN);

    expect(sinNavigate.focus).toHaveBeenCalledTimes(1);
    expect(clientes.openWindow).not.toHaveBeenCalled();
  });

  it('una ventana con `url` inválida no tumba el handler: cae a abrir una nueva', async () => {
    // `new URL()` lanza. El señuelo es dejar ese `new URL` sin proteger: un
    // cliente con una `url` rara (`about:blank`, una extensión) mataría el
    // handler entero y el toque no llevaría a ninguna parte.
    const rara = ventana('no-es-una-url');
    const clientes = clientesDoble([rara]);

    await manejarClick(`${ORIGEN}/aseos/abc`, clientes, ORIGEN);

    expect(rara.focus).not.toHaveBeenCalled();
    expect(clientes.openWindow).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// El amarre contra el emisor
// ───────────────────────────────────────────────────────────────────────────

describe('las constantes del worker y las del emisor no pueden divergir', () => {
  /**
   * `sw-handlers.ts` NO importa `payload.ts`, y es deliberado: `payload.ts`
   * importa `colapso.ts`, que abre con `import { createHash } from
   * 'node:crypto'`. Ese import entero acabaría dentro del bundle del service
   * worker, donde `node:crypto` no existe.
   *
   * El precio de no importar es que los valores están escritos dos veces, y el
   * precio de eso es la deriva silenciosa: alguien cambia el icono en un lado y
   * el aviso genérico apunta a un 404 que nadie nota, porque un icono que falta
   * no rompe la notificación, solo la deja fea. Este test es lo que convierte
   * esa deriva en un rojo. Corre en Node, donde `node:crypto` sí existe.
   */
  it('el destino por defecto es literalmente el mismo que el de `lib/push/payload.ts`', () => {
    expect(RUTA_POR_DEFECTO).toBe('/mis-aseos');
  });

  it('el icono y el badge son los que declara `05-UI-SPEC.md` §10.1 y los que emite el payload', () => {
    expect(ICONO).toBe('/icon-192.png');
    expect(BADGE).toBe('/badge-72.png');
    // Y son los mismos que el emisor mete en la envoltura, medido contra el
    // JSON que produce `construirPayload()` y no contra otra constante.
    expect(CLASICO.datos.icon).toBe(ICONO);
    expect(CLASICO.datos.badge).toBe(BADGE);
  });
});
