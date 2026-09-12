'use server';

import 'server-only';

import { NoAutorizado, exigirSesion } from '@/lib/auth/guards';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { mapDbError, type DbErrorLike } from '@/lib/domain/errors';
import {
  esquemaEndpointDePush,
  esquemaSuscripcion,
} from '@/lib/domain/suscripcion.schema';
import type { CodigoDePush } from '@/lib/data/push';

/**
 * LAS TRES SERVER ACTIONS DEL ARBOL DEL ASEADOR.
 *
 * ── EL ORDEN DE LAS TRES PRIMERAS OPERACIONES NO ES ESTILISTICO ─────────────
 *
 *   1. `exigirSesion()`  — un Server Action es un endpoint HTTP PUBLICO
 *   2. `safeParse()`     — lo minimo, antes de tocar la base
 *   3. la escritura      — SOLO entonces, y con el JWT del usuario
 *
 * Mismas palabras y mismo molde que `app/(admin)/operacion/_actions.ts`, con UNA
 * diferencia que hay que leer despacio: aqui el guard es `exigirSesion()` y NO
 * el que ademas exige rol de administrador. El nombre de aquel otro guard no se
 * escribe en este archivo ni en prosa: el criterio que lo vigila es un grep sin
 * filtro de comentarios, igual que los guardarrailes de `scripts/ci/`.
 *
 * Y esa eleccion de guard NO es un descuido que haya que "endurecer": desde el
 * plan 05-15, `registrarSuscripcion` la llama TAMBIEN la franja de permiso de
 * `/operacion` (05-UI-SPEC §13), porque el criterio 3 de NOTIF-02 exige que el
 * administrador reciba avisos y para eso su navegador tiene que registrarse por
 * la misma puerta. La action escribe SIEMPRE sobre `user_id = auth.uid()`, asi
 * que quien la llama solo puede registrar su propio navegador, sea quien sea.
 *
 * Invertir 1 y 3 no es un descuido de estilo: convertiria el registro de
 * suscripciones en un endpoint abierto, y el `endpoint` de una suscripcion es
 * una CREDENCIAL DE ENVIO. Quien lo registra decide a que telefono le escribe el
 * sistema (T-05-39).
 *
 * ── NINGUNA CONSTRUYE LA FABRICA ADMINISTRATIVA ────────────────────────────
 *
 * La frontera de estas tres es la policy `push_subs_own_all` de la migracion 08
 * (el aseador solo ve y escribe SUS filas) mas el grant POR COLUMNA de la
 * migracion 16. Un cliente que salta la RLS no habilitaria nada nuevo y si
 * convertiria este archivo en una escalada de privilegios de una linea el dia
 * que alguien borrara un `exigirSesion()`. `scripts/ci/check-service-role.sh`
 * rompe el build si aparece, y ademas hace grep del nombre literal de la
 * variable de entorno de la clave de servicio: ese nombre NO se escribe en este
 * archivo, ni siquiera dentro de un comentario.
 *
 * ── NINGUNA ESCRIBE LA EVIDENCIA DE VERIFICACION ───────────────────────────
 *
 * Las cuatro columnas que la migracion 16 le quito a `authenticated` no aparecen
 * en ningun objeto de este archivo, y no por disciplina: escribirlas fallaria en
 * runtime, que es exactamente lo que se quiere. Si el aseador pudiera firmar el
 * acta de que le llego el aviso, el estado `Activos` de §5.2 seria
 * autocertificado y la unica verificacion de la fase seria teatro (T-05-13).
 *
 * ── NINGUNA LLAMA `revalidatePath` ────────────────────────────────────────
 *
 * En `(admin)` esta prohibido por un bug MEDIDO que cuelga el navegador (ver la
 * cabecera de `app/(admin)/operacion/_actions.ts`). En `(cleaner)`, que es un
 * arbol nuevo y mucho mas liviano, ese bug NO esta medido: no se asume ni que
 * exista ni que no, y se prefiere `router.refresh()` en el cliente por
 * consistencia con el resto del repo. Ademas, ninguna de estas tres cambia nada
 * que la pantalla del aseador renderice desde el servidor.
 */

/**
 * El codigo que queda en `revoked_reason` cuando la baja la pide el propio
 * telefono. Es un CODIGO de la union cerrada de `lib/data/push.ts`, no un texto
 * libre: esa columna la puede llegar a ver el admin, y la regla 2 de aquel
 * modulo existe para que un mensaje de error de la libreria de envio —que
 * arrastra el `endpoint` entero— no acabe ahi.
 */
const MOTIVO_BAJA_PROPIA: CodigoDePush = 'baja_desde_el_telefono';

const MENSAJE_DATOS_INVALIDOS = 'Datos invalidos.';

/**
 * El guard, en la forma que permite escribirlo como PRIMERA linea de cada
 * action. Devuelve el contexto, o el `ResultadoAccion` de rechazo.
 *
 * Cualquier error que no sea `NoAutorizado` SE RELANZA: un GoTrue caido no es
 * "no tienes permiso", y disfrazarlo mandaria al aseador a pedirle al admin unos
 * permisos que ya tiene.
 */
async function guard(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof exigirSesion>>['supabase']; uid: string }
  | { ok: false; error: string }
> {
  try {
    const { supabase, user } = await exigirSesion();
    return { ok: true, supabase, uid: user.id };
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }
}

/** Lee una clave del `FormData` como cadena, o cadena vacia si no vino. */
function campo(formData: FormData, clave: string): string {
  const valor = formData.get(clave);
  return typeof valor === 'string' ? valor : '';
}

function fallo(error: DbErrorLike): { ok: false; error: string } {
  return { ok: false, error: mapDbError(error) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1/3 — EL REGISTRO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * NOTIF-01. Registra el destino de los avisos de ESTE navegador.
 *
 * ── POR QUE EL UPSERT VA `on conflict (endpoint)` Y NO POR `(user_id, endpoint)`
 *
 * Es el invariante escrito en la migracion 06 (T-01-36): **el endpoint
 * identifica al NAVEGADOR, no a la persona**. El indice unico de esa tabla es
 * global sobre `endpoint` justamente por eso.
 *
 * El caso real que resuelve es el telefono compartido. Si una aseadora entra en
 * el telefono de otra, el navegador devuelve EL MISMO endpoint, y el upsert
 * REASIGNA `user_id` en vez de crear una segunda fila. Con unicidad compuesta
 * convivirian dos suscripciones vivas sobre el mismo destino y el aseo de una
 * acabaria sonando en el telefono de la otra (T-05-40).
 *
 * Escribe SOLO las siete columnas que el grant por columna de la migracion 16
 * permite a `authenticated`. Hay un test que cuenta las claves del objeto.
 */
export async function registrarSuscripcion(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  // ── 2. VALIDACION: AQUI ES DONDE SE CIERRA EL SSRF (T-05-02) ───────────────
  // La forma se vuelve a armar anidada porque asi la devuelve `toJSON()` del
  // navegador; lo que viaja por `FormData` es plano.
  const userAgent = campo(formData, 'user_agent').trim();
  const parseado = esquemaSuscripcion.safeParse({
    endpoint: campo(formData, 'endpoint'),
    keys: {
      p256dh: campo(formData, 'p256dh'),
      auth: campo(formData, 'auth'),
    },
    // El cliente manda la cadena `'true'`; cualquier otra cosa es `false`. No se
    // deja entrar un `undefined` para que el booleano sea siempre explicito.
    soportaDeclarativo: campo(formData, 'soporta_declarativo') === 'true',
    userAgent: userAgent.length > 0 ? userAgent : undefined,
  });
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  // ── 3. SOLO AHORA, LA BASE, CON EL JWT DEL USUARIO ─────────────────────────
  const { endpoint, keys, soportaDeclarativo } = parseado.data;

  const { error } = await ctx.supabase.from('push_subscriptions').upsert(
    {
      user_id: ctx.uid,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      // `null` y no cadena vacia: el resto del sistema lee la ausencia de dato
      // como `null`, y una cadena vacia seria un user agent que nadie mando.
      user_agent: parseado.data.userAgent ?? null,
      soporta_declarativo: soportaDeclarativo,
      // Se refresca en cada arranque de la app. Es de donde sale la linea
      // "Ultima vez que abrio la app" del `title` de §5.2.
      visto_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
  if (error) return fallo(error);

  // El copy NO promete una entrega. Registrar significa "hay a donde enviar", y
  // eso es `Sin probar` en la vista del admin, no `Activos`. Hay un test que
  // recorre los tres mensajes de exito de este archivo buscando esa promesa.
  return { ok: true, mensaje: 'Este telefono quedo registrado.' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2/3 — LA BAJA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * NOTIF-04, la mitad del cliente. Marca muerta la suscripcion de este navegador
 * cuando el propio navegador hace `unsubscribe()`.
 *
 * Escribe DOS columnas y solo dos, igual que `revocarSuscripcion()` de
 * `lib/data/push.ts`, que es la puerta del worker para el mismo hecho. `user_id`
 * NO entra: la migracion 16 se lo quito al grant de update a proposito, para que
 * la reasignacion pase por una funcion definer y nunca por el navegador.
 *
 * El `.eq('endpoint', …)` no autoriza nada por si solo: quien acota las filas es
 * la policy `push_subs_own_all`, que solo deja ver —y por tanto actualizar— las
 * del usuario de la sesion. Marcar por endpoint y no por id existe porque el
 * navegador conoce su endpoint y no conoce el id de nuestra fila.
 */
export async function revocarSuscripcionPropia(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaEndpointDePush.safeParse(campo(formData, 'endpoint'));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase
    .from('push_subscriptions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: MOTIVO_BAJA_PROPIA,
    })
    .eq('endpoint', parseado.data);
  if (error) return fallo(error);

  return { ok: true, mensaje: 'Este telefono quedo fuera.' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3/3 — LA MARCA DE VISTO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Una sola columna: `visto_at`.
 *
 * Alimenta la linea "Ultima vez que abrio la app" del `title` de §5.2, que es lo
 * que le permite al admin distinguir un telefono apagado de uno que abre la app
 * todos los dias. **Es un dato de diagnostico, y por eso el cliente si lo puede
 * escribir**: la migracion 16 lo deja en el grant por columna con ese argumento
 * escrito al lado. La evidencia de verificacion, que es lo que decide `Activos`,
 * NO esta ahi y no se puede escribir desde aqui.
 */
export async function marcarVisto(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaEndpointDePush.safeParse(campo(formData, 'endpoint'));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase
    .from('push_subscriptions')
    .update({ visto_at: new Date().toISOString() })
    .eq('endpoint', parseado.data);
  if (error) return fallo(error);

  return { ok: true, mensaje: 'Listo.' };
}
