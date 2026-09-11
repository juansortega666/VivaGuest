import { esClaveDeTopicValida, type ClaseDeAviso } from './colapso';

/**
 * EL CUERPO DEL AVISO DE PUSH: LO ÚNICO DE ESTA FASE QUE SE RENDERIZA FUERA DE
 * LA APLICACIÓN.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ NO SALE DE AQUÍ, NUNCA (D-06):
 *
 *   · EL CÓDIGO DE ACCESO DEL APARTAMENTO. Vive en tabla aparte, con RPC y
 *     auditoría, y la única salida legítima es `reveal_access_code()`, que deja
 *     rastro en `access_code_reads` (T-01-48). Un código que viaja en un aviso
 *     sale SIN rastro: nadie puede decir después quién lo vio.
 *
 *   · EL NOMBRE DEL HUÉSPED, y cualquier otro dato suyo.
 *
 * La razón es física y no de política: el payload va cifrado en tránsito, pero
 * termina RENDERIZADO EN LA PANTALLA DE BLOQUEO de un teléfono que puede estar
 * sobre una mesa, y después persiste en la bandeja del sistema operativo, fuera
 * del alcance de la aplicación y de su sesión.
 *
 * LA GARANTÍA NO ES LA DISCIPLINA: ES EL TIPO. `EntradaDePayload` es un
 * subconjunto CERRADO de la fila de `notifications` y no tiene ranura donde
 * poner ninguna de las dos cosas de arriba; meterlas tendría que ser —y es— un
 * error de compilación. Mismo patrón, y por la misma razón, que `LineaDeLog` en
 * el worker de sincronización de la Fase 3.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL COPY SE RENDERIZA, NO SE ESCRIBE AQUÍ ────────────────────────────────
 *
 * `title` y `body` ya vienen redactados en español desde las migraciones 09, 13
 * y 15, y D-04 prohíbe tocar los RPC que los escriben. Este módulo los emite
 * VERBATIM, igual que el panel de alertas de la Fase 4 hace con las mismas dos
 * columnas. No recorta, no capitaliza y no prefija.
 *
 * ── ESTE MÓDULO ES PURO ─────────────────────────────────────────────────────
 *
 * No importa `web-push`, no lee el entorno, no toca la base y no importa nada de
 * `app/`. En particular, el origen absoluto que la envoltura declarativa
 * necesita entra POR PARÁMETRO desde el worker y no por una variable de entorno:
 * es lo que permite probar las dos envolturas sin montar entorno ninguno.
 *
 * ── POR QUÉ HAY DOS ENVOLTURAS Y NO UNA (D-07) ──────────────────────────────
 *
 * Un destino moderno de Apple entiende el formato DECLARATIVO: si el JSON lleva
 * la clave mágica y un `notification` con `title` y `navigate`, el sistema
 * operativo pinta el aviso él solo. Si hay service worker, recibe igual su
 * evento con la notificación propuesta; si el handler pinta un reemplazo, ese
 * gana, y si no pinta nada, se muestra la declarativa. Esa red de seguridad es
 * justo lo que evita la penalización por no mostrar nada, que en ese sistema
 * cuesta la suscripción entera.
 *
 * En Chrome NO está implementado, y ahí viven las aseadoras con Android: no se
 * puede usar como mecanismo único. De ahí dos ramas separadas, y no una
 * envoltura siempre presente: separadas se pueden probar las dos, que es lo que
 * D-07 exige explícitamente.
 */

// ───────────────────────────────────────────────────────────────────────────
// La entrada
// ───────────────────────────────────────────────────────────────────────────

/**
 * EL SUBCONJUNTO CERRADO DE LA FILA DE `notifications` QUE EL AVISO NECESITA.
 *
 * Cinco campos. Ni uno más, y la ausencia de los demás es la decisión, no un
 * olvido: ver la cabecera del módulo.
 *
 * Los nombres van en `snake_case` porque son las columnas tal como las devuelve
 * `supabase-js`, igual que en `EntradaDeColapso`: quien llame va a tener la fila
 * en la mano y no debería renombrar nada para pasarla.
 */
export type EntradaDePayload = {
  /** El id de la notificación. No viaja al aviso: sirve para diagnosticar. */
  id: string;
  /** La clase de evento. Decide la urgencia del envío. */
  type: ClaseDeAviso;
  /** `notifications.title`, verbatim. */
  title: string;
  /** `notifications.body`, verbatim. */
  body: string;
  /** `notifications.url`, que vale `/aseos/{id}` desde la migración 09. */
  url: string | null;
};

/** Lo que decide esta fase, porque no está en la base. */
export type OpcionesDePayload = {
  /** Si el destino entiende el formato declarativo. Elige la rama. */
  soportaDeclarativo: boolean;
  /**
   * El origen absoluto de la aplicación (`https://host`), que la envoltura
   * declarativa necesita para su destino de navegación. Entra por parámetro y
   * NO por entorno, para que el módulo siga siendo puro.
   */
  origen: string;
  /**
   * La clave de colapso de `claveDeColapso()`. Es la MISMA que va en la
   * cabecera `Topic`, y por eso se valida con el criterio de esa cabecera.
   */
  tag?: string;
};

// ───────────────────────────────────────────────────────────────────────────
// Las constantes
// ───────────────────────────────────────────────────────────────────────────

/**
 * El tope de bytes del JSON. Apple corta en 4 KB; el margen de un kilobyte es
 * para la sobrecarga del cifrado, que este módulo no ve.
 *
 * Pasarse devuelve `413` / `PayloadTooLarge`, que `decidir()` clasifica como
 * BUG y no reintenta: un payload de más de 4 KB lo sigue siendo en el quinto
 * intento. Por eso se corta acá, donde el bug es visible, y no allá.
 *
 * Se exporta para que el test lea el número de aquí y no lo repita.
 */
export const LIMITE_BYTES = 3 * 1024;

/**
 * Cuánto retiene el push service un aviso no entregado: cuatro horas.
 *
 * Horas y no días, y el número no es una convención: un aviso de «te asignaron
 * el aseo de mañana» que llega tres días tarde es ruido, y cuatro horas es
 * además la ventana total que agota el backoff de `errores.ts` (4 860 s). Que
 * las dos ventanas coincidan es lo que evita reintentar un aviso que el push
 * service ya descartó.
 */
export const TTL_SEGUNDOS = 4 * 60 * 60;

/**
 * Adónde va el toque cuando la notificación no trae destino propio.
 *
 * La lista del aseador, no cadena vacía: una cadena vacía en el destino de
 * navegación abre la raíz o no abre nada según el sistema, y un aviso que al
 * tocarlo no lleva a ninguna parte es peor que no haberlo mandado.
 */
export const RUTA_POR_DEFECTO = '/mis-aseos';

/** §14 del contrato de diseño. */
const ICONO = '/icon-192.png';

/**
 * Monocromo. Android lo pinta en la barra de estado y sin él pone un cuadrado
 * gris genérico.
 */
const BADGE = '/badge-72.png';

// ───────────────────────────────────────────────────────────────────────────
// El destino del toque
// ───────────────────────────────────────────────────────────────────────────

/**
 * La ruta a la que lleva el aviso, saneada.
 *
 * `notifications.url` la escriben los RPC y hoy es siempre una ruta relativa
 * (`/aseos/{id}`). La comprobación existe igual porque el destino se resuelve
 * contra un origen absoluto: una `url` que apuntara a otro origen, o un
 * esquema ejecutable, sacaría a la aseadora de la aplicación DESDE LA PANTALLA
 * DE BLOQUEO, donde no hay barra de direcciones que delate el salto. Es barato
 * y cierra la puerta antes de que alguien escriba el siguiente emisor.
 */
function rutaSegura(url: string | null): string {
  if (!url) return RUTA_POR_DEFECTO;
  // Una sola barra inicial: `//host` es una URL con origen, no una ruta.
  if (!url.startsWith('/') || url.startsWith('//')) return RUTA_POR_DEFECTO;
  return url;
}

/**
 * El destino absoluto. `origen` tiene que ser una URL absoluta `http(s)`: si no
 * lo es, es un defecto del llamador y se ve acá, no en el teléfono.
 */
function destino(origen: string, url: string | null): string {
  let base: URL;
  try {
    base = new URL(origen);
  } catch {
    throw new Error('origen_invalido');
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new Error('origen_invalido');
  }
  return new URL(rutaSegura(url), base).toString();
}

// ───────────────────────────────────────────────────────────────────────────
// La urgencia
// ───────────────────────────────────────────────────────────────────────────

/**
 * La cabecera `Urgency` del envío.
 *
 * `high` solo para la asignación: la aseadora tiene que enterarse ya, porque de
 * ese aviso depende que el aseo se ejecute. Todo lo demás le llega a un admin
 * que está frente a un panel y puede esperar; pedir `high` para todo gasta
 * batería ajena y le quita significado a la palabra.
 */
export function urgenciaDe(type: ClaseDeAviso): 'high' | 'normal' {
  return type === 'asignacion' ? 'high' : 'normal';
}

// ───────────────────────────────────────────────────────────────────────────
// El constructor
// ───────────────────────────────────────────────────────────────────────────

/** El bloque que lee el handler `push` del service worker. */
type BloqueClasico = {
  titulo: string;
  cuerpo: string;
  url: string;
  icon: string;
  badge: string;
  tag?: string;
};

/**
 * El JSON que sale hacia el push service, ya serializado.
 *
 * @param entrada  El subconjunto cerrado de la fila de `notifications`.
 * @param opciones La rama, el origen absoluto y la clave de colapso.
 *
 * @throws `origen_invalido`        si el origen no es una URL absoluta http(s).
 * @throws `tag_invalido`           si la clave de colapso no cabe en `Topic`.
 * @throws `payload_excede_limite`  si el JSON se pasa de `LIMITE_BYTES`.
 *
 * Los tres mensajes son códigos de una lista cerrada y NO arrastran el payload
 * ni parte de él: el mismo criterio que `CodigoDeFallo` en `lib/data/sync.ts`,
 * porque un mensaje de error acaba en un log y el log se lee.
 */
export function construirPayload(entrada: EntradaDePayload, opciones: OpcionesDePayload): string {
  const url = destino(opciones.origen, entrada.url);

  // La clave de colapso se valida con el criterio de la cabecera `Topic` aunque
  // acá sea solo un `tag`: D-05 exige que las dos capas colapsen con LA MISMA
  // clave, y una que el servidor de push rechazara dejaría la bandeja del
  // teléfono colapsando distinto que el servidor, en silencio. El señuelo real
  // es el UUID crudo: 36 caracteres y guiones fuera del alfabeto base64url.
  if (opciones.tag !== undefined && !esClaveDeTopicValida(opciones.tag)) {
    throw new Error('tag_invalido');
  }

  const clasico: BloqueClasico = {
    titulo: entrada.title,
    cuerpo: entrada.body,
    url,
    icon: ICONO,
    badge: BADGE,
    ...(opciones.tag !== undefined ? { tag: opciones.tag } : {}),
  };

  // `requireInteraction` NO aparece en ninguna de las dos ramas, y es una
  // decisión: en el sistema de Apple no aplica, y en Android deja el aviso
  // pegado hasta que alguien lo toque. Con quince asignaciones en tanda eso es
  // una pantalla bloqueada.
  const cuerpo = opciones.soportaDeclarativo
    ? {
        // La clave mágica del formato declarativo. Quitarla pierde la red de
        // seguridad del sistema operativo descrita en la cabecera del módulo.
        web_push: 8030,
        notification: {
          title: entrada.title,
          body: entrada.body,
          navigate: url,
          silent: false,
          lang: 'es-CO',
          dir: 'ltr',
          icon: ICONO,
          badge: BADGE,
          ...(opciones.tag !== undefined ? { tag: opciones.tag } : {}),
        },
        datos: clasico,
      }
    : { datos: clasico };

  const json = JSON.stringify(cuerpo);
  if (Buffer.byteLength(json, 'utf8') > LIMITE_BYTES) {
    throw new Error('payload_excede_limite');
  }
  return json;
}
