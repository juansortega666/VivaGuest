import { z } from 'zod';

/**
 * Forma y host permitidos de la URL de exportación iCal, ANTES de cualquier
 * petición de red (UI-SPEC §10.3 estado 2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO ES LA PRIMERA MITAD DE LA DEFENSA ANTI-SSRF (T-02-72).
 *
 * El servidor va a hacer `fetch` sobre una cadena que escribe un usuario. Esta
 * allowlist decide a qué host se le permite escribir. La SEGUNDA mitad vive en
 * `validarFeed` y es `redirect: 'manual'`: esto valida lo que el usuario
 * ESCRIBE, no a dónde TERMINA el fetch, y un 302 hacia `169.254.169.254` o
 * hacia `localhost:54321` saltaría esta comprobación entera. Las dos mitades
 * son necesarias y ninguna sobra.
 *
 * SE PARSEA CON EL CONSTRUCTOR `URL` Y SE COMPARA CAMPO POR CAMPO. NUNCA CON
 * UNA REGEX SOBRE LA CADENA COMPLETA, y esto no es preferencia de estilo:
 *
 *   https://evil.com/?x=airbnb.com/calendar/ical/1.ics
 *
 * contiene literalmente `airbnb.com`, `/calendar/ical/` y `.ics`, así que
 * cualquier regex razonable sobre la cadena la acepta. Su `hostname` es
 * `evil.com`. Lo mismo con `https://www.airbnb.com@evil.com/calendar/ical/1.ics`,
 * donde `www.airbnb.com` es el userinfo y el host sigue siendo `evil.com`.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Dominios de Airbnb. Se comparan como SUFIJO DE ETIQUETA sobre el `hostname`,
 * es decir: igual al dominio, o terminado en `.` + dominio.
 *
 * Un `hostname.includes('airbnb.com')` acepta `airbnb.com.evil.com`, y un
 * `endsWith('airbnb.com')` sin el punto acepta `notairbnb.com`. Por eso la
 * comparación de abajo exige la frontera de etiqueta explícitamente.
 */
export const hostsPermitidos = ['airbnb.com', 'airbnb.com.co'] as const;

/** Todo feed de Airbnb cuelga de aquí. */
const SEGMENTO_ICAL = '/calendar/ical/';

/** El copy exacto de UI-SPEC §10.3, estado 2. Es lo que se pinta inline. */
export const MENSAJE_FORMATO_INVALIDO =
  'Ese link no parece una exportación de calendario de Airbnb. Debe empezar por https://www.airbnb.com/calendar/ical/ y terminar en .ics.';

/**
 * CONCESIÓN DE TESTEABILIDAD, CON CANDADO. Lee esto entero antes de tocarlo.
 *
 * El `fetch` de validación lo hace el SERVIDOR, no el navegador, así que
 * `page.route()` de Playwright no lo intercepta: la petición ni siquiera pasa
 * por el navegador. La única forma de ejercitar los siete estados de UI-SPEC
 * §10.3 contra cuerpos controlados es levantar un servidor HTTP local que sirva
 * las fixtures y dejar que la allowlist admita `127.0.0.1`.
 *
 * EL CANDADO TIENE DOS VUELTAS, Y LA SEGUNDA EXISTE PORQUE LA PRIMERA NO BASTA:
 *
 *   1. `NODE_ENV !== 'production'` cubre `vitest` (`'test'`) y `next dev`
 *      (`'development'`). Es el candado que pide 02-RESEARCH §7.3.
 *
 *   2. `NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL === '1'` cubre la suite de Playwright,
 *      y hace falta porque el candado 1 NO PUEDE distinguirla de un despliegue
 *      real: `playwright.config.ts` arranca el servidor con
 *      `next build && next start`, que corre con `NODE_ENV=production` igual que
 *      producción, y además Next INLINEA `process.env.NODE_ENV` en tiempo de
 *      build, así que en el bundle compilado no queda ninguna lectura que se
 *      pueda cambiar en runtime. Medido: ver 02-14-SUMMARY.md.
 *
 * Por qué `NEXT_PUBLIC_` y no una variable de servidor a secas, que sería el
 * instinto: el prefijo hace que el valor se INLINEE EN TIEMPO DE BUILD, y eso
 * aquí es MÁS fuerte, no más débil. Un build de producción que no la lleva
 * puesta compila esta rama a `false` constante; ya no queda ninguna variable de
 * entorno que alguien pueda poner en el panel de Vercel para reabrirla. Y hace
 * falta que el valor exista también en el cliente, porque este mismo esquema es
 * el que valida en `blur`/`change` sin red (estado 2): si el navegador
 * rechazara `127.0.0.1` mientras el servidor lo acepta, el botón de validar
 * nunca se habilitaría en la suite.
 */
export function permiteHostLocal(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL === '1';
}

/** El host de pruebas es una dirección literal de loopback, nunca un nombre. */
const HOST_LOCAL = '127.0.0.1';

/**
 * `hostname` pertenece a un dominio de la allowlist.
 *
 * La comparación es sobre el `hostname` que devuelve `URL`, ya sin userinfo y
 * sin puerto, y exige frontera de etiqueta:
 *   `airbnb.com`            → sí (igual)
 *   `www.airbnb.com`        → sí (sufijo `.airbnb.com`)
 *   `www.airbnb.com.co`     → sí (sufijo `.airbnb.com.co`)
 *   `airbnb.com.evil.com`   → NO
 *   `notairbnb.com`         → NO
 */
function hostEnAllowlist(hostname: string): boolean {
  // Un FQDN con punto final (`www.airbnb.com.`) es el mismo host para el
  // resolvedor y otra cadena para `endsWith`. Se normaliza antes de comparar.
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return hostsPermitidos.some((dominio) => host === dominio || host.endsWith(`.${dominio}`));
}

/**
 * La comprobación completa. Devuelve `true` solo si las cuatro cosas se
 * cumplen: protocolo, host, segmento de ruta y extensión.
 */
export function esUrlIcalDeAirbnb(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    // `URL` lanza con cualquier cosa que no sea una URL absoluta. Una cadena
    // suelta o una ruta relativa caen aquí, que es lo correcto.
    return false;
  }

  const local = permiteHostLocal() && url.hostname === HOST_LOCAL;

  // `http:` SOLO para el loopback de pruebas. Airbnb sirve por `https:`, y
  // aceptar `http:` contra su host sería mandar la credencial en texto claro.
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return false;

  if (!local && !hostEnAllowlist(url.hostname)) return false;

  // `pathname` no incluye ni la query ni el fragmento: por eso el `?s=…` de
  // Airbnb no interfiere, y por eso `?x=…/calendar/ical/1.ics` no cuela.
  if (!url.pathname.includes(SEGMENTO_ICAL)) return false;
  if (!url.pathname.toLowerCase().endsWith('.ics')) return false;

  return true;
}

/**
 * El esquema que usan LAS DOS ORILLAS: el navegador en `blur`/`change` para el
 * estado 2 (sin red) y `validarFeed` en el servidor antes del `fetch`. Es el
 * mismo módulo a propósito: dos copias de una allowlist se desincronizan, y la
 * que se olvidaría de actualizar es justo la del servidor.
 */
export const esquemaUrlIcal = z
  .string()
  .trim()
  .min(1, MENSAJE_FORMATO_INVALIDO)
  .refine(esUrlIcalDeAirbnb, MENSAJE_FORMATO_INVALIDO);

/** Los ocho puntos medios de UI-SPEC §10.4: no es una `x`, es `•`. */
const RELLENO = '•'.repeat(8);

/**
 * La forma en que la URL guardada se vuelve a mostrar (UI-SPEC §10.4, regla 2):
 * `…/calendar/ical/12345678.ics?s=••••••••`.
 *
 * MITIGA T-02-74. Una captura de pantalla del dashboard, un pantallazo pegado
 * en un chat de soporte o una grabación de una demo filtrarían la credencial
 * entera. Lo que queda visible es el último segmento del path —suficiente para
 * que el admin reconozca CUÁL link es— y nada del `?s=`, que es la parte
 * inadivinable.
 *
 * Vive aquí y no dentro del componente por dos razones: es lógica pura, y
 * `vitest.config.ts` solo recoge `lib/**`, así que dentro de un `.tsx` sería
 * intesteable por construcción.
 */
export function enmascararUrlIcal(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Una fila vieja con basura en la columna no debe romper la pantalla, y
    // desde luego no debe caer al `else` de "muéstrala tal cual".
    return `…${RELLENO}`;
  }

  const segmento = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  const cola = parsed.search.length > 0 ? `?s=${RELLENO}` : '';

  return `…/calendar/ical/${segmento}${cola}`;
}
