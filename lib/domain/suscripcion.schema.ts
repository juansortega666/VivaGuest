import { z } from 'zod';

/**
 * Forma y host permitidos del `PushSubscription` que manda el navegador, ANTES
 * de que llegue a una columna.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO ES LA DEFENSA ANTI-SSRF DE LA FASE 5 (T-05-02).
 *
 * El `endpoint` de una suscripcion NO es un dato: es una URL que NUESTRO
 * SERVIDOR va a visitar con POST cada vez que haya un aviso que mandar. Sin esta
 * allowlist, cualquiera con sesion de aseador registra un endpoint apuntando a
 * un servicio interno y convierte el worker de drenaje en un emisor de
 * peticiones a donde quiera.
 *
 * El precedente exacto en este repo es `./ical-url.schema.ts`, que hace lo mismo
 * para los feeds de Airbnb, y la trampa que ambos esquivan es la misma:
 *
 *   SE PARSEA CON EL CONSTRUCTOR `URL` Y SE COMPARA EL `hostname` CAMPO POR
 *   CAMPO. NUNCA CON UNA REGEX NI CON UN `includes` SOBRE LA CADENA CRUDA.
 *
 *     https://evil.com/?x=https://web.push.apple.com/QABC123
 *
 * contiene literalmente `push.apple.com`, asi que cualquier `includes`
 * razonable la acepta. Su `hostname` es `evil.com`. Y lo mismo con
 * `https://web.push.apple.com@evil.com/QABC123`, donde el host bueno es el
 * userinfo y el host real sigue siendo `evil.com`.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Los cuatro servicios de push que existen, y no hay un quinto: Apple, Google,
 * Mozilla y Microsoft. Salen del `05-RESEARCH.md` §Security Domain.
 *
 * Se comparan como SUFIJO DE ETIQUETA sobre el `hostname`: igual al dominio, o
 * terminado en `.` + dominio. Un `includes('push.apple.com')` aceptaria
 * `push.apple.com.evil.com`, y un `endsWith('push.apple.com')` sin el punto
 * aceptaria `xpush.apple.com`. La comparacion de abajo exige la frontera de
 * etiqueta explicitamente, y hay un test por cada uno de esos dos casos.
 *
 * `fcm.googleapis.com` se lista como host exacto a proposito: Google no cuelga
 * los endpoints de un subdominio, y ampliar la entrada a `googleapis.com`
 * abriria la allowlist a la superficie entera de las APIs de Google.
 */
export const HOSTS_DE_PUSH = [
  'push.apple.com',
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
] as const;

/**
 * El mensaje que ve quien manda un endpoint invalido.
 *
 * NO nombra la allowlist ni dice cual de las cuatro comprobaciones fallo: quien
 * llega aqui con un endpoint de su propio navegador no lo ve nunca, y quien
 * llega a proposito no necesita un oraculo que le afine el siguiente intento.
 */
export const MENSAJE_ENDPOINT_INVALIDO =
  'El destino del aviso no es valido para este telefono.';

/**
 * `hostname` pertenece a un dominio de la allowlist.
 *
 * La comparacion es sobre el `hostname` que devuelve `URL`, ya sin userinfo y
 * sin puerto, y exige frontera de etiqueta:
 *   `push.apple.com`           -> si (igual)
 *   `web.push.apple.com`       -> si (sufijo `.push.apple.com`)
 *   `push.apple.com.evil.com`  -> NO
 *   `xpush.apple.com`          -> NO
 */
function hostEnAllowlist(hostname: string): boolean {
  // Un FQDN con punto final (`web.push.apple.com.`) es el mismo host para el
  // resolvedor y otra cadena para `endsWith`. Se normaliza antes de comparar.
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return HOSTS_DE_PUSH.some((dominio) => host === dominio || host.endsWith(`.${dominio}`));
}

/**
 * La comprobacion completa: es una URL absoluta, va por `https` y su host esta
 * en la allowlist.
 *
 * No hace falta una regla aparte contra las IP literales ni contra `localhost`:
 * ninguna de las dos puede pasar la allowlist, porque `169.254.169.254` no
 * termina en ninguno de los cuatro dominios. Se prueban igual, porque son el
 * objetivo real del ataque y un test que los nombra es lo que impide que alguien
 * "simplifique" la allowlist a un `endsWith` sin punto dentro de seis meses.
 */
export function esEndpointDePush(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    // `URL` lanza con cualquier cosa que no sea una URL absoluta: una cadena
    // suelta, una ruta relativa o el vacio caen aqui, que es lo correcto.
    return false;
  }

  // `https` SIN EXCEPCION, y aqui no hay la concesion de loopback que
  // `./ical-url.schema.ts` si tiene: aquella existe para que Playwright pueda
  // servir fixtures, y esto no se ejercita con un servidor local. Un endpoint
  // por `http` mandaria el aviso en claro por la red del telefono.
  if (url.protocol !== 'https:') return false;

  return hostEnAllowlist(url.hostname);
}

/** El `endpoint` a secas. Lo usan la baja y la marca de visto, que no mandan claves. */
export const esquemaEndpointDePush = z
  .string()
  .trim()
  .min(1, MENSAJE_ENDPOINT_INVALIDO)
  .refine(esEndpointDePush, MENSAJE_ENDPOINT_INVALIDO);

/**
 * Alfabeto base64url de RFC 4648 §5, sin relleno.
 *
 * `+` y `/` NO entran: el navegador serializa las dos claves en url-safe, y una
 * cadena con el alfabeto estandar significa que alguien la construyo a mano.
 */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Longitudes plausibles, no exactas.
 *
 * `p256dh` es un punto P-256 sin comprimir: 65 bytes, que en base64url sin
 * relleno son 87 caracteres. `auth` es un secreto de 16 bytes: 22 caracteres.
 * Los margenes cubren el relleno que algun navegador pudiera incluir sin abrir
 * la puerta a una cadena de kilobytes, que es lo unico que la cota alta protege.
 */
const clave = (min: number, max: number) =>
  z.string().trim().min(min).max(max).regex(BASE64URL);

/**
 * El `PushSubscriptionJSON` que devuelve `subscription.toJSON()`, mas los dos
 * datos que anade el cliente: el feature detect del formato declarativo (D-07) y
 * la cadena de user agent, que es puro diagnostico.
 *
 * La forma es ANIDADA porque asi la devuelve el navegador. La Server Action, que
 * recibe un `FormData` plano, la vuelve a armar antes de validar: la alternativa
 * seria un esquema plano que no se parece a nada de lo que existe en el
 * navegador, y entonces el sitio donde se pierde un campo deja de ser evidente.
 */
export const esquemaSuscripcion = z.object({
  endpoint: esquemaEndpointDePush,
  keys: z.object({
    p256dh: clave(80, 96),
    auth: clave(20, 28),
  }),
  soportaDeclarativo: z.boolean(),
  /**
   * Recortado y no rechazado por largo: es un dato de diagnostico y perder el
   * registro entero de una suscripcion buena por una cadena rara del navegador
   * seria peor que guardar 512 caracteres.
   */
  userAgent: z
    .string()
    .trim()
    .transform((s) => s.slice(0, 512))
    .optional(),
});

export type Suscripcion = z.infer<typeof esquemaSuscripcion>;
