/**
 * LOS DOS HANDLERS DEL SERVICE WORKER, FUERA DEL SERVICE WORKER.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE MÓDULO EXISTE, Y POR QUÉ ESTA LÓGICA NO VIVE EN `app/sw.ts`
 *
 * Apple, verbatim: *"Safari doesn't support invisible push notifications.
 * Present push notifications to the user immediately after your service worker
 * receives them. If you don't, Safari revokes the push notification permission
 * for your site."* Y WebKit: *"Violations of the `userVisibleOnly` promise will
 * result in a push subscription being revoked."*
 *
 * El modo de fallo de un bug acá NO es un aviso perdido. Es que a esa aseadora
 * se le revoca la suscripción y deja de recibir TODO, en silencio: sin error en
 * ninguna consola, sin fila en la base, sin nada que un admin pueda ver. El
 * siguiente aseo asignado simplemente no se ejecuta, y la primera señal llega
 * cuando un huésped entra a un apartamento sin asear.
 *
 * Un service worker no se puede instrumentar con Vitest, y Playwright no
 * ejecuta service workers en WebKit. O sea: todo lo que viva dentro de
 * `app/sw.ts` es código que NO se puede probar. Sacar la lógica a este módulo
 * es la única mitigación de T-05-30 que no depende de que alguien tenga
 * cuidado. `app/sw.ts` queda como cableado y nada más.
 *
 * De ahí también la forma de las dos funciones: reciben POR PARÁMETRO lo que
 * necesitan (`self.registration`, `self.clients`, `self.location.origin`) en
 * vez de leer globales. Es lo que permite pasarles objetos planos espiados.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── ESTE MÓDULO NO IMPORTA NADA, Y ES A PROPÓSITO ───────────────────────────
 *
 * Lo bundlea Serwist dentro de `public/sw.js`. Importar `./payload` para reusar
 * sus constantes arrastraría `./colapso`, que abre con
 * `import { createHash } from 'node:crypto'`: un módulo de Node dentro de un
 * service worker. Por eso los cuatro valores compartidos están escritos otra
 * vez aquí, y por eso `sw-handlers.test.ts` los amarra contra `payload.ts` con
 * aserciones: el test corre en Node, donde `node:crypto` sí existe, así que la
 * deriva se paga en rojo y no en un icono roto que nadie mira.
 */

// ───────────────────────────────────────────────────────────────────────────
// Las constantes. Duplicadas de `lib/push/payload.ts` a propósito; ver arriba.
// ───────────────────────────────────────────────────────────────────────────

/** `05-UI-SPEC.md` §14. Mismo valor que el `ICONO` de `payload.ts`. */
export const ICONO = '/icon-192.png';

/**
 * Monocromo. Android lo pinta como máscara en la barra de estado y sin él pone
 * un cuadrado gris genérico. Mismo valor que el `BADGE` de `payload.ts`.
 */
export const BADGE = '/badge-72.png';

/**
 * Adónde lleva el toque cuando no hay destino utilizable. La lista de la
 * aseadora, no la raíz ni cadena vacía: un aviso que al tocarlo no lleva a
 * ninguna parte es peor que no haberlo mandado. Mismo valor que el
 * `RUTA_POR_DEFECTO` de `payload.ts`.
 */
export const RUTA_POR_DEFECTO = '/mis-aseos';

/**
 * El título del aviso genérico: el que se muestra cuando el payload no se pudo
 * leer. Es el nombre de la aplicación y nada más, porque en ese punto no se
 * sabe de qué apartamento ni de qué aseo se trata y NO se puede inventar.
 */
export const TITULO_GENERICO = 'VivaGuest';

/**
 * El cuerpo del aviso genérico. Deliberadamente vago y deliberadamente
 * accionable: no promete nada que no se sepa, y al tocarlo lleva a la lista,
 * donde el dato real sí está.
 */
export const CUERPO_GENERICO = 'Tienes una novedad. Tócalo para verla.';

// ───────────────────────────────────────────────────────────────────────────
// Los tipos del entorno, declarados por estructura y no importados del DOM
// ───────────────────────────────────────────────────────────────────────────

/** Lo que estas funciones muestran. `requireInteraction` NO está, ver abajo. */
export type OpcionesDeAviso = {
  body: string;
  icon: string;
  badge: string;
  lang: string;
  dir: 'ltr';
  silent: boolean;
  tag?: string;
  data: { url: string };
};

/** El trozo de `self.registration` que hace falta. */
export type RegistroDeNotificaciones = {
  showNotification(titulo: string, opciones: OpcionesDeAviso): Promise<void>;
};

/** El trozo de un `WindowClient` que hace falta. `navigate` es opcional. */
export type VentanaDeCliente = {
  url: string;
  focus(): Promise<unknown>;
  navigate?(url: string): Promise<unknown>;
};

/** El trozo de `self.clients` que hace falta. */
export type ClientesDelWorker = {
  matchAll(opciones: {
    type: 'window';
    includeUncontrolled: boolean;
  }): Promise<readonly VentanaDeCliente[]>;
  openWindow(url: string): Promise<unknown>;
};

// ───────────────────────────────────────────────────────────────────────────
// Lectura del payload
// ───────────────────────────────────────────────────────────────────────────

/** Una cadena usable, o nada. Un `42` o un `{a:1}` cuentan como nada. */
function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}

/** Un objeto indexable, o nada. */
function objeto(valor: unknown): Record<string, unknown> | undefined {
  return typeof valor === 'object' && valor !== null
    ? (valor as Record<string, unknown>)
    : undefined;
}

type Contenido = { titulo: string; cuerpo: string; url: string; tag?: string };

/**
 * Interpreta las DOS envolturas de D-07 sobre el mismo objeto.
 *
 * La declarativa (iOS 18.4+) trae `notification` con `title`, `body` y
 * `navigate`; la clásica (Android, y todo lo demás) trae `datos` con `titulo`,
 * `cuerpo` y `url`. Se prefiere la declarativa cuando está, porque es la que el
 * sistema operativo ya propuso: pintar el mismo texto encima es lo que hace que
 * se vea UNA notificación y no dos.
 *
 * Devuelve `undefined` si no hay nada legible, y entonces se muestra el
 * genérico. Nunca lanza por forma: lanzar acá y que el `catch` de `manejarPush`
 * lo recoja daría el mismo resultado, pero pasando por una excepción que no
 * aporta información.
 */
function interpretar(crudo: unknown): Contenido | undefined {
  const sobre = objeto(crudo);
  if (!sobre) return undefined;

  const declarativo = objeto(sobre.notification);
  const clasico = objeto(sobre.datos);

  const titulo = texto(declarativo?.title) ?? texto(clasico?.titulo);
  const cuerpo = texto(declarativo?.body) ?? texto(clasico?.cuerpo);
  if (!titulo || !cuerpo) return undefined;

  return {
    titulo,
    cuerpo,
    // El destino se guarda tal cual viene y se sanea al USARLO, en
    // `manejarClick`. Saneamos allá y no acá porque acá no se conoce el origen
    // de la aplicación y allá sí.
    url: texto(declarativo?.navigate) ?? texto(clasico?.url) ?? RUTA_POR_DEFECTO,
    tag: texto(declarativo?.tag) ?? texto(clasico?.tag),
  };
}

/**
 * Las opciones del aviso.
 *
 * `icon` y `badge` salen de las constantes de arriba y NO del payload, aunque
 * el payload los traiga: son assets fijos de la aplicación, y dejar que el
 * emisor elija a qué URL apunta lo que se pinta en la pantalla de bloqueo es
 * una puerta que no hace falta abrir.
 *
 * `requireInteraction` NO aparece, y es una decisión de `05-UI-SPEC.md` §10.1:
 * en iOS no aplica, y en Android deja el aviso pegado hasta que alguien lo
 * toque. Con quince asignaciones en tanda eso es una pantalla bloqueada.
 *
 * `silent` es `false` SIEMPRE: un aviso silencioso viola la promesa
 * `userVisibleOnly` y cuesta la suscripción entera.
 */
function opcionesDe(url: string, cuerpo: string, tag?: string): OpcionesDeAviso {
  return {
    body: cuerpo,
    icon: ICONO,
    badge: BADGE,
    lang: 'es-CO',
    dir: 'ltr',
    silent: false,
    ...(tag !== undefined ? { tag } : {}),
    data: { url },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// El handler de `push`
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pinta el aviso. **Es el código más caro de equivocar de todo el proyecto.**
 *
 * @param datos    El `event.data` del evento `push`. Puede ser `null`, y su
 *                 `.json()` PUEDE LANZAR: es entrada no confiable que llega de
 *                 la red y termina renderizada en la pantalla de bloqueo.
 * @param registro `self.registration`.
 * @returns La promesa que el llamador mete en `event.waitUntil()`. Devolverla
 *          no es cosmético: sin ella el navegador da el evento por terminado y
 *          puede matar el worker antes de que la notificación exista.
 *
 * ═══ REGLA DURA ════════════════════════════════════════════════════════════
 * NUNCA se sale de esta función sin haber llamado `showNotification`. Ni por
 * la rama de error, ni por la de payload nulo, ni por ninguna otra. Si algún
 * día hay un `return` temprano acá arriba, está mal.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function manejarPush(
  datos: unknown,
  registro: RegistroDeNotificaciones,
): Promise<void> {
  // Se parte del genérico COMPLETO y solo se reemplaza entero si todo salió
  // bien. El señuelo es construir las opciones a pedazos dentro del `try`: un
  // fallo a mitad las dejaría mutadas por la mitad y pintaría un aviso sin
  // icono ni destino.
  let titulo = TITULO_GENERICO;
  let opciones = opcionesDe(RUTA_POR_DEFECTO, CUERPO_GENERICO);

  try {
    const fuente = objeto(datos);
    const leer = fuente?.json;
    if (typeof leer === 'function') {
      const contenido = interpretar((leer as () => unknown).call(fuente));
      if (contenido) {
        titulo = contenido.titulo;
        opciones = opcionesDe(contenido.url, contenido.cuerpo, contenido.tag);
      }
    }
  } catch {
    // El payload no se pudo leer. Se muestra el genérico y ya.
    //
    // NO se registra el payload ni parte de él (T-05-33): trae el nombre del
    // apartamento, y la consola de un dispositivo se lee. Y NO se relanza:
    // relanzar acá rechaza la promesa de `event.waitUntil()`, lo que en Safari
    // cuenta como no haber mostrado nada y cuesta la suscripción, que es
    // exactamente el desenlace que este `catch` existe para evitar.
  }

  await registro.showNotification(titulo, opciones);
}

// ───────────────────────────────────────────────────────────────────────────
// El handler de `notificationclick`
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resuelve el destino contra el origen de la aplicación y descarta cualquier
 * cosa que se salga de él.
 *
 * El payload de push viaja cifrado y autenticado, así que esto no ataja un
 * atacante de red: ataja al emisor. Un `notifications.url` mal escrito —o
 * escrito por un RPC futuro que nadie revisó— sacaría a la aseadora de la
 * aplicación DESDE LA PANTALLA DE BLOQUEO, donde no hay barra de direcciones
 * que delate el salto. Mismo criterio y misma razón que `rutaSegura()` en
 * `lib/push/payload.ts`, aplicado otra vez del lado del dispositivo porque
 * aquí llega lo que llegue, no lo que aquel módulo emitió.
 */
function destinoSeguro(destino: unknown, origen: string): string {
  const candidato = texto(destino);
  if (!candidato) return RUTA_POR_DEFECTO;
  try {
    if (new URL(candidato, origen).origin !== new URL(origen).origin) {
      return RUTA_POR_DEFECTO;
    }
    return candidato;
  } catch {
    return RUTA_POR_DEFECTO;
  }
}

/** `true` si la ventana es de este origen. Una `url` rara no tumba nada. */
function esDeEsteOrigen(ventana: VentanaDeCliente, origen: string): boolean {
  try {
    return new URL(ventana.url).origin === new URL(origen).origin;
  } catch {
    return false;
  }
}

/**
 * Lleva el toque a donde toca, reusando la ventana que ya esté abierta.
 *
 * @param destino  El `url` que `manejarPush` guardó en `data`. Se sanea aquí.
 * @param clientes `self.clients`.
 * @param origen   `self.location.origin`.
 *
 * El antipatrón que esto evita: llamar `clients.openWindow()` a ciegas abre una
 * pestaña nueva CADA VEZ, aunque la aplicación ya esté abierta. Después de tres
 * avisos la aseadora tiene tres copias de la app compitiendo entre sí.
 *
 * `includeUncontrolled: true` no es decorativo: una pestaña abierta antes de
 * que este worker tomara el control no aparece sin esa opción, y entonces se
 * abriría una ventana nueva encima de una que ya existía.
 */
export async function manejarClick(
  destino: unknown,
  clientes: ClientesDelWorker,
  origen: string,
): Promise<void> {
  const url = destinoSeguro(destino, origen);

  const ventanas = await clientes.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  for (const ventana of ventanas) {
    if (!esDeEsteOrigen(ventana, origen)) continue;
    await ventana.focus();
    // `navigate` es opcional en la plataforma. Si no está, al menos la ventana
    // quedó al frente: mejor eso que abrir una segunda.
    if (typeof ventana.navigate === 'function') await ventana.navigate(url);
    return;
  }

  await clientes.openWindow(url);
}
