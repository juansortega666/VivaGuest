import { createHash } from 'node:crypto';

import type { Enums } from '@/lib/database.types';

/**
 * LA CLAVE DE COLAPSO DE UN AVISO DE PUSH (D-05).
 *
 * `Topic` (colapsa en el servidor de push) y `tag` (colapsa en la bandeja del
 * teléfono) llevan LA MISMA clave, la que devuelve este módulo, para que las dos
 * capas colapsen igual. Si llevaran claves distintas, el push service podría
 * reemplazar un aviso que el teléfono muestra aparte, o al revés.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UN AVISO COLAPSADO BORRA AL ANTERIOR. EL TEXTO VIEJO NO VUELVE.
 *
 * De ahí que equivocarse aquí sea caro y silencioso: nadie ve el aviso que no
 * llegó. El fallo concreto que este módulo existe para evitar, literal de D-05,
 * es que un DAÑO REPORTADO borre un "NO PUEDO" del mismo aseo de la bandeja del
 * admin antes de que lo lea (T-05-20).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA CORRECCIÓN SOBRE EL `05-CONTEXT.md`, Y ES LA RAZÓN DE SER DEL MÓDULO ──
 *
 * El `05-CONTEXT.md` supone que la clase de evento se puede leer del prefijo del
 * `dedupe_key`. El `05-PATTERNS.md` lo midió leyendo las migraciones y NO es
 * así: ahí solo hay un VERBO.
 *
 *   · `assign:` (`confirm_cleaning`) y el `assign:` de `reassign_cleaning` son
 *     dos emisores distintos de la MISMA clase `asignacion`;
 *   · `cancel:` y `rev:` son dos verbos distintos de la MISMA clase
 *     `aseo_cancelado`;
 *   · y nada en el `dedupe_key` impide que dos emisores de CLASES distintas
 *     acaben compartiendo prefijo el día que alguien escriba el siguiente.
 *
 * La clase de verdad es `notifications.type`, que es una columna del enum
 * `notification_type`. Por eso `type` entra en el material del hash. No es un
 * descuido ni una redundancia: es la decisión, y `colapso.test.ts` la sostiene
 * recorriendo los catorce emisores del repo por pares.
 *
 * ── POR QUÉ UN HASH Y NO EL `dedupe_key` TAL CUAL ───────────────────────────
 *
 * La cabecera `Topic` admite como mucho 32 caracteres del alfabeto base64 seguro
 * para URL (documentación de Apple). Los `dedupe_key` reales miden entre 16 y 80
 * caracteres y llevan `:` y guiones de UUID, ninguno de los dos en ese alfabeto:
 * mandarlos crudos devuelve `BadWebPushTopic`. Un UUID pelado tampoco sirve, son
 * 36 caracteres con guiones.
 *
 * ── ESTE MÓDULO ES PURO ─────────────────────────────────────────────────────
 *
 * Su único import en tiempo de ejecución es `node:crypto`. El `import type` de
 * `Enums` lo borra el compilador y no existe en el bundle: está para que
 * `ClaseDeAviso` quede ATADO al enum de la base, y que añadir un valor a
 * `notification_type` sin pasar por aquí sea un error de tipos y no una
 * sorpresa. Misma regla de pureza que `lib/domain/alertas.ts`.
 */

/** Las once clases de `public.notification_type`, atadas al enum de la base. */
export type ClaseDeAviso = Enums<'notification_type'>;

/**
 * El subconjunto de la fila de `notifications` del que se deriva la clave.
 *
 * Los nombres van en `snake_case` porque son las columnas tal como las devuelve
 * `supabase-js`: quien llame a esta función va a tener la fila en la mano y no
 * debería tener que renombrar nada para pasarla.
 */
export type EntradaDeColapso = {
  /** A quién le llega. Dos personas nunca comparten clave. */
  recipient_id: string;
  /** LA CLASE DE EVENTO. Es lo que impide que dos clases se borren entre sí. */
  type: ClaseDeAviso;
  /** El aseo, si el aviso es de un aseo. */
  cleaning_id: string | null;
  /** El `dedupe_key` del emisor. Discrimina los avisos que no son de un aseo. */
  dedupe_key: string | null;
  /** El id de la notificación. Último recurso: hace el aviso irrepetible. */
  id: string;
};

/**
 * El tope duro de la cabecera `Topic`, de la documentación de Apple. No es una
 * preferencia: pasarse devuelve `BadWebPushTopic`.
 */
export const LARGO_MAXIMO_DE_TOPIC = 32;

/**
 * A cuántos caracteres se recorta el hash.
 *
 * VEINTIDÓS Y NO TREINTA Y DOS. Veintidós caracteres base64url son 132 bits, de
 * sobra para ocho usuarios y decenas de avisos al día —el cumpleaños sobre 2^132
 * no se acerca ni de lejos—, y dejan diez caracteres de margen bajo el tope
 * duro. Ese margen es el que permite que mañana se pueda prefijar la clave (por
 * entorno, por versión de formato) sin rediseñar nada ni volver a leer la
 * documentación de Apple para acordarse del límite.
 *
 * Se exporta para que el test lo lea de aquí y no repita el número.
 */
export const LARGO_DE_CLAVE = 22;

/** El alfabeto base64 seguro para URL. Sin `+`, sin `/` y sin relleno `=`. */
const ALFABETO_BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * La clave con la que dos avisos se colapsan: `Topic` en el servidor de push y
 * `tag` en la bandeja del teléfono.
 *
 * El material es una cadena canónica con separador fijo:
 *
 *     <recipient_id> ":" <type> ":" <discriminador>
 *
 * y el discriminador es, por este orden:
 *
 *   1. `cleaning_id`, cuando el aviso es de un aseo. Es lo que hace que dos
 *      avisos de la misma clase sobre el mismo aseo se reemplacen (§10.2) y que
 *      la tanda de quince aseos produzca quince avisos y no uno.
 *   2. `dedupe_key`, cuando no hay aseo. Es lo que respeta el CUBO DE TIEMPO del
 *      watchdog: el cubo existe para producir repetición a propósito, y una
 *      clave que lo ignorase desharía esa decisión en la capa de push.
 *   3. `id`, cuando no hay ninguno de los dos. Una clave por notificación, que
 *      no colapsa con nada: es lo correcto para un aviso irrepetible.
 *
 * El separador `:` no es ambiguo aunque `dedupe_key` también lo use: los dos
 * primeros campos son un UUID de largo fijo y un valor de enum sin `:`, así que
 * el resto de la cadena solo se puede leer de una forma.
 */
export function claveDeColapso(n: EntradaDeColapso): string {
  const discriminador = n.cleaning_id ?? n.dedupe_key ?? n.id;
  const material = `${n.recipient_id}:${n.type}:${discriminador}`;

  // `base64url` directo en `digest()`, NO un reemplazo a mano sobre `base64`.
  // El relleno `=` y los caracteres `+` y `/` son justo los tres que
  // `BadWebPushTopic` rechaza, y hacerlo a mano es donde se olvida uno.
  return createHash('sha256').update(material, 'utf8').digest('base64url').slice(0, LARGO_DE_CLAVE);
}

/**
 * Si una cadena sirve como valor de la cabecera `Topic`.
 *
 * Existe para que el worker del plan 05-06 pueda afirmarlo antes de mandar la
 * cabecera: es una comprobación de microsegundos contra un error que, del otro
 * lado, llega como un `BadWebPushTopic` sin decir cuál de las tres reglas se
 * rompió.
 */
export function esClaveDeTopicValida(s: string): boolean {
  return s.length > 0 && s.length <= LARGO_MAXIMO_DE_TOPIC && ALFABETO_BASE64URL.test(s);
}
