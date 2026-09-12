/**
 * LA MITAD IMPURA DEL ESTADO DE LOS AVISOS (05-UI-SPEC §5.1, §8.3 y §17.4).
 *
 * ── POR QUE ESTE MODULO NO VIVE EN `lib/domain/` ─────────────────────────────
 *
 * Porque LEE EL NAVEGADOR, y eso rompe la regla de pureza que la cabecera de
 * `lib/domain/alertas.ts` fija para ese directorio. `lib/domain/avisos.ts` decide
 * en que estado esta el aseador, y lo hace con seis booleanos que le entran por
 * parametro; este archivo es el que va a buscar esos seis booleanos. Separarlos es
 * lo que hace que los seis casos del contrato se puedan probar sin un navegador,
 * que es justo donde no se pueden probar.
 *
 * ── LA REGLA DEL MODULO, Y SU UNICA EXCEPCION ────────────────────────────────
 *
 * LA DETECCION ES POR FEATURE DETECT, NO POR CADENA DE USER AGENT.
 *
 * La excepcion, declarada y acotada, son `esNavegadorEmbebido()` y
 * `plataformaVisible()`: NO EXISTE feature detect para "estoy dentro del navegador
 * de WhatsApp" ni para "esto es un iPhone". Las dos se pueden equivocar y las dos
 * estan acotadas a decidir QUE INSTRUCCIONES MOSTRAR, nunca a autorizar nada
 * (T-05-37). Por eso §8.3 pone ademas un toggle manual `iPhone` / `Android`: el
 * contrato ya asume que esta deteccion falla a veces.
 *
 * ── POR QUE CADA FUNCION RECIBE LA VENTANA POR PARAMETRO ─────────────────────
 *
 * Con valor por defecto, asi que el sitio de uso no escribe nada. Sirve para dos
 * cosas: hace probable el modulo con objetos planos, sin jsdom; y como el valor por
 * defecto se evalua EN LA LLAMADA y no al importar, el modulo no revienta al
 * cargarse en el servidor.
 */

/**
 * Lo unico de `window` que este modulo mira. Un `window` real encaja aqui por
 * estructura, asi que el valor por defecto no necesita ninguna conversion.
 */
export type VentanaDeAvisos = {
  matchMedia?: (consulta: string) => { matches: boolean };
  navigator?: { standalone?: boolean; userAgent?: string };
  /**
   * Solo en Safari 18.4+. Su PRESENCIA es el feature detect del formato
   * declarativo; ver `soportaDeclarativo()`.
   */
  pushManager?: unknown;
};

/** Las tres plataformas para las que §8.3 tiene juego de instrucciones. */
export type PlataformaVisible = 'iphone' | 'android' | 'otro';

/**
 * La app corre instalada en la pantalla de inicio.
 *
 * Los dos caminos hacen falta y no son redundantes: `display-mode: standalone` es el
 * estandar (Android y iOS moderno) y `navigator.standalone` es el indicador
 * heredado de Safari, que sigue siendo el que contesta en iPhones viejos. Basta uno.
 *
 * Es la distincion de la que cuelga la diferencia entre S1 y S0 de §5.1: en una
 * pestana de Safari iOS falta `Notification` porque falta la instalacion, no porque
 * el iPhone no pueda.
 */
export function estaInstalada(w: VentanaDeAvisos = window): boolean {
  const porDisplayMode = w.matchMedia?.('(display-mode: standalone)').matches === true;
  const porIndicadorHeredado = w.navigator?.standalone === true;

  return porDisplayMode || porIndicadorHeredado;
}

/**
 * El navegador entiende el formato declarativo de Web Push (D-07).
 *
 * ── LA CADENA DE RAZONAMIENTO, ESCRITA PORQUE ES UNA DECISION DE DISCRECION ──
 *
 * `05-CONTEXT.md` deja D-07 a discrecion, asi que dentro de un mes esta linea se
 * leeria como magia sin esto.
 *
 * MDN BCD, citado en `05-RESEARCH.md` §"Declarative Web Push" (leido 2026-09-03):
 *
 *     Window.pushManager   safari: 18.4 | safari_ios: 18.4 | chrome: false
 *                          (crbug.com/382298314)
 *
 * Es decir: la interfaz `PushManager` colgada de LA VENTANA existe exactamente en
 * los navegadores que muestran la notificacion declarativa por si solos, y en
 * ninguno mas. Su presencia en el ambito de pagina ES, por tanto, el feature detect
 * del formato declarativo. No hay una API "soportaDeclarativo" que preguntar.
 *
 * NO CONFUNDIR CON `ServiceWorkerRegistration.pushManager`, que es OTRA cosa y
 * existe en todas partes, Chrome incluida. Mirar ese marcaria a Chrome como
 * compatible, que es precisamente lo que el bug de Chromium dice que no es. Hay un
 * test con ese nombre.
 *
 * Se detecta aqui, al suscribirse, y se guarda en
 * `push_subscriptions.soporta_declarativo`.
 */
export function soportaDeclarativo(w: VentanaDeAvisos = window): boolean {
  return 'pushManager' in w;
}

/**
 * Marcas de los tres navegadores embebidos que importan.
 *
 * Facebook no pone su nombre: pone `FBAN` (app name), `FBAV` (app version) o
 * `FB_IAB` (in-app browser) dentro de unos corchetes al final de la cadena.
 */
const NAVEGADORES_EMBEBIDOS = /(WhatsApp|Instagram|FBAN|FBAV|FB_IAB|FBIOS)/i;

/**
 * La app se esta viendo DENTRO de otra aplicacion, y por tanto no se puede instalar.
 *
 * Es el caso mas probable de todos y no una rareza: el link del onboarding se manda
 * por WhatsApp (§7.6). Es tambien la unica salida que ese banner ofrece, porque es
 * el unico sub-caso de S0 donde hay algo que hacer.
 *
 * AQUI SI SE MIRA LA CADENA DE USER AGENT. Es una de las dos excepciones declaradas
 * en la cabecera: no existe feature detect para esto.
 */
export function esNavegadorEmbebido(w: VentanaDeAvisos = window): boolean {
  return NAVEGADORES_EMBEBIDOS.test(w.navigator?.userAgent ?? '');
}

/**
 * Que juego de instrucciones de §8.3 mostrar.
 *
 * AQUI TAMBIEN SE MIRA LA CADENA DE USER AGENT, y es la segunda y ultima excepcion
 * de la cabecera. Se puede equivocar —un iPad con iPadOS 13+ se anuncia como
 * Macintosh y cae en `otro`— y por eso §8.3 pone debajo el toggle manual
 * `iPhone` / `Android`. Devolver `otro` cuando no se puede decidir es mejor que
 * adivinar: unas instrucciones de la plataforma equivocada son peores que preguntar.
 *
 * Android se mira PRIMERO porque su cadena es la inequivoca; las de iOS llevan
 * `like Mac OS X`, que es exactamente la clase de coincidencia parcial que confunde
 * a un orden al reves.
 */
export function plataformaVisible(w: VentanaDeAvisos = window): PlataformaVisible {
  const ua = w.navigator?.userAgent ?? '';

  if (/Android/i.test(ua)) return 'android';
  if (/(iPhone|iPad|iPod)/i.test(ua)) return 'iphone';

  return 'otro';
}

/** Base64url: el alfabeto de RFC 4648 §5, con relleno opcional. */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * Convierte la clave publica VAPID a los bytes que `applicationServerKey` acepta.
 *
 * La guarda de formato no es ceremonia: sin ella, una clave mal copiada en una
 * variable de entorno revienta dentro de `atob` con un `InvalidCharacterError` que
 * no nombra ni la clave ni la variable, a cien lineas del sitio real. Y la
 * suscripcion que la usa nace muerta sin decirlo.
 *
 * `decodificar` entra por parametro con `atob` por defecto, misma razon que la
 * ventana de las otras funciones: `atob` existe tanto en el navegador como en Node,
 * asi que esto no ata el modulo a ninguno de los dos.
 */
export function base64UrlAUint8(
  base64url: string,
  decodificar: (texto: string) => string = atob,
): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(base64url)) {
    throw new Error(`base64UrlAUint8: la clave no es base64url valida: ${JSON.stringify(base64url)}`);
  }

  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');

  let crudo: string;
  try {
    crudo = decodificar(base64);
  } catch {
    throw new Error(
      `base64UrlAUint8: la clave es base64url por forma pero no se pudo decodificar: ${JSON.stringify(base64url)}`,
    );
  }

  // Se reserva el buffer y se llena, en vez del `Uint8Array.from()` de una linea
  // que trae el research. No es estilo: desde TypeScript 5.7 `Uint8Array` es
  // generico sobre su buffer y `from()` devuelve `Uint8Array<ArrayBufferLike>`,
  // que la ranura `applicationServerKey` de `subscribe()` NO acepta (pide
  // `ArrayBufferView<ArrayBuffer>`, y un `SharedArrayBuffer` no lo es). El
  // constructor con longitud si devuelve el tipo estrecho. Medido con `tsc`.
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i += 1) {
    bytes[i] = crudo.charCodeAt(i);
  }

  return bytes;
}

/**
 * El `PushSubscriptionJSON` del navegador, aplanado al `FormData` que espera
 * `registrarSuscripcion`.
 *
 * ── POR QUE VIVE AQUI Y NO JUNTO AL BOTON QUE LA ESTRENO ───────────────────
 *
 * Porque LEE EL NAVEGADOR —`navigator.userAgent` y el feature detect del formato
 * declarativo—, que es la definicion de este modulo, y porque desde el plan 05-15
 * la llaman DOS arboles: el banner del aseador y la franja de permiso del admin
 * de `/operacion` (§13). Dejarla en un componente de `app/(cleaner)/` obligaria a
 * `(admin)` a importar de un arbol que no es el suyo.
 *
 * `soportaDeclarativo()` se evalua aqui y no en el servidor porque es un feature
 * detect DEL NAVEGADOR (D-07): en el servidor no hay nada que detectar.
 */
export function aFormDataDeSuscripcion(suscripcion: PushSubscriptionJSON): FormData {
  const f = new FormData();
  f.set('endpoint', suscripcion.endpoint ?? '');
  f.set('p256dh', suscripcion.keys?.p256dh ?? '');
  f.set('auth', suscripcion.keys?.auth ?? '');
  f.set('soporta_declarativo', soportaDeclarativo() ? 'true' : 'false');
  f.set('user_agent', navigator.userAgent);
  return f;
}
