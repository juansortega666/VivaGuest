'use server';

import 'server-only';

import { z } from 'zod';

import { NoAutorizado, exigirSesion } from '@/lib/auth/guards';
import type { CodigoDePush } from '@/lib/data/push';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { mapDbError, type DbErrorLike } from '@/lib/domain/errors';
import { esquemaEndpointDePush } from '@/lib/domain/suscripcion.schema';
import { claveDeColapso } from '@/lib/push/colapso';
import { enviar, TIMEOUT_MS } from '@/lib/push/envio';
import { decidir } from '@/lib/push/errores';
import { origenDeLaAplicacion } from '@/lib/push/origen';
import { construirPayload } from '@/lib/push/payload';

/**
 * EL PASO 4 DEL ASISTENTE DE INSTALACION: EL AVISO DE PRUEBA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO ES EL CONTRATO DE D-02, Y D-02 ES TEXTUAL DEL USUARIO:
 *
 *   LA INSTALACION NO TERMINA CUANDO LA APP APARECE EN LA PANTALLA DE INICIO.
 *   TERMINA CUANDO LLEGO UN AVISO DE PRUEBA A ESE TELEFONO.
 *
 * De ahi salen los DOS GRADOS de confirmacion, y la razon de que sean dos es lo
 * unico que hace que la distincion sirva de algo:
 *
 *   · POR TOQUE (el bueno). El aviso navega a `/instalar?prueba={token}`. Al
 *     tocarlo, la app se abre ahi y el servidor consume el token. Es la unica
 *     evidencia que no depende de que nadie diga nada: el aviso se pinto, el
 *     aseador lo vio, y era tocable.
 *   · A MANO (el flojo). Existe porque el caso real es alguien acompanando el
 *     onboarding y un aviso que se descarta sin querer. Deja al aseador en
 *     `Sin probar` a ojos del admin (§5.2), y la pantalla de cierre se lo dice
 *     de frente.
 *
 * Si no se distinguieran, `Ya sono, no alcance a tocarlo` seria un boton para
 * saltarse la unica verificacion de la fase (T-05-36).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL ORDEN DE LAS PRIMERAS OPERACIONES NO ES ESTILISTICO ──────────────────
 *
 *   1. `exigirSesion()`  — un Server Action es un endpoint HTTP PUBLICO
 *   2. `safeParse()`     — lo minimo, antes de tocar la base
 *   3. el RPC            — SOLO entonces, y con el JWT del usuario
 *   4. el envio          — solo despues de que el RPC haya contado el intento
 *
 * Aqui el guard es `exigirSesion()` y NO el que ademas exige rol de
 * administrador: esto lo llama un aseador sobre su propio telefono. El nombre de
 * aquel otro guard no se escribe en este archivo ni en prosa, porque el criterio
 * que lo vigila es un grep sin filtro de comentarios.
 *
 * Y hay un cuarto escalon que las otras actions del arbol no tienen: EL ENVIO VA
 * DESPUES DEL RPC, SIEMPRE. Este camino manda un push de verdad, y un boton que
 * dispara envios y se puede llamar en bucle es un amplificador (T-05-08). El
 * tope de tres lo cuenta la base con `for update`, no el navegador. Si se
 * enviara primero, un fallo del tope no habria contado el intento y el limite
 * seria evadible reintentando.
 *
 * ── NINGUNA ESCRIBE LA EVIDENCIA DE VERIFICACION ───────────────────────────
 *
 * Las cuatro columnas que la migracion 16 le quito a `authenticated` no aparecen
 * en ningun objeto de este archivo, y no por disciplina: escribirlas fallaria en
 * runtime, que es exactamente lo que se quiere. El camino correcto son las tres
 * funciones `security definer`. Si el aseador pudiera firmar el acta de que le
 * llego el aviso, el estado `Activos` de §5.2 seria autocertificado y la unica
 * verificacion de la fase seria teatro (T-05-13).
 *
 * Tampoco se LEE la columna de intentos. El contador `Intento 2 de 3` de §8.7 es
 * cortesia de pantalla; el control es el RPC, y el estado de agotado llega por
 * `topeAgotado`, no por una cuenta del cliente.
 *
 * ── NINGUNA CONSTRUYE LA FABRICA ADMINISTRATIVA ────────────────────────────
 *
 * La frontera de las tres es la policy `push_subs_own_all` de la migracion 08
 * mas la propiedad que los tres RPC comprueban DENTRO del mismo select que
 * localiza la fila. Un cliente que saltara la RLS no habilitaria nada nuevo y si
 * convertiria este archivo en una escalada de privilegios de una linea el dia
 * que alguien borrara un `exigirSesion()`. `scripts/ci/check-service-role.sh`
 * rompe el build si aparece, y ademas hace grep del nombre literal de la
 * variable de entorno de la clave de servicio: ese nombre NO se escribe en este
 * archivo, ni siquiera dentro de un comentario.
 *
 * ── NINGUNA LLAMA `revalidatePath` ────────────────────────────────────────
 *
 * Mismo criterio que el resto del arbol: el refresco lo pide el cliente con
 * `router.refresh()`. Ademas, el estado del paso 4 vive en el componente hasta
 * que la pagina se recarga.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EL COPY DEL AVISO DE PRUEBA — §10.1, LITERAL
//
// Es el UNICO copy de aviso nuevo de la fase. Todo el resto de `title` y `body`
// ya viene redactado desde las migraciones 09, 13 y 15 y se emite verbatim.
//
// `Tocalo para terminar` NO ES DECORATIVO: es lo que produce la confirmacion por
// toque, que es el grado bueno. Quitarlo deja al aseador sin saber que el aviso
// hay que tocarlo, y la instalacion termina confirmada a mano.
// ═══════════════════════════════════════════════════════════════════════════════

const TITULO_DE_PRUEBA = 'Prueba de VivaGuest';
const CUERPO_DE_PRUEBA = 'Si ves esto, tu teléfono ya recibe los avisos. Tócalo para terminar.';

/**
 * DOS MINUTOS, Y SON MINUTOS A PROPOSITO.
 *
 * El resto de avisos del sistema retiene cuatro HORAS (`TTL_SEGUNDOS`), porque
 * una asignacion sigue sirviendo un rato despues. Un aviso de prueba, no: el
 * aseador esta mirando la pantalla AHORA, con alguien al lado, y el copy de §8.6
 * le dice *"si no llega en un minuto, vuelve a enviarlo"*. Un aviso de prueba
 * que llega media hora despues no verifica nada y encima suena cuando el
 * asistente ya se cerro.
 */
const TTL_DE_PRUEBA_SEGUNDOS = 120;

/**
 * EL DISCRIMINADOR DE COLAPSO DEL AVISO DE PRUEBA, Y POR QUE ES ESTE.
 *
 * `claveDeColapso()` deriva la clave de `destinatario : clase : discriminador`.
 * La clase sale de `notification_type`, que `lib/push/colapso.ts` ata AL ENUM DE
 * LA BASE a proposito, para que anadir un valor sin pasar por ahi sea un error
 * de tipos. Un aviso de prueba NO es una fila de `notifications` —no la escribe
 * nadie, no entra al panel de alertas, no se audita— asi que no tiene, ni debe
 * tener, clase propia en ese enum.
 *
 * La separacion se consigue entonces por el DISCRIMINADOR, y queda garantizada
 * por construccion y no por suerte: una asignacion real SIEMPRE lleva
 * `cleaning_id`, que es un uuid, y `claveDeColapso()` lo prefiere sobre esta
 * cadena. Dos materiales distintos, dos claves distintas. Un aviso de prueba no
 * puede borrar una asignacion de la bandeja, que es lo que D-05 protege.
 *
 * Y al ser ESTABLE por aseador, los reenvios del paso 4 si colapsan entre si:
 * tres intentos dejan un solo aviso en la bandeja, el ultimo. Es lo correcto —
 * los dos anteriores ya no sirven para nada.
 */
const DISCRIMINADOR_DE_PRUEBA = 'prueba-de-aviso';

const MENSAJE_DATOS_INVALIDOS = 'Datos invalidos.';

/** §15.3. El mismo copy que cuando el telefono no se deja conectar. */
const MENSAJE_SUSCRIPCION_MUERTA =
  'No se pudo conectar este teléfono. Vuelve a intentarlo. Si sigue sin funcionar, avísale a tu administrador.';

/** §15.3, adaptado: qué pasó y qué hacer, sin jerga y sin signos de admiración. */
const MENSAJE_ENVIO_FALLIDO =
  'No se pudo enviar el aviso de prueba. Vuelve a intentarlo en un momento.';

const MENSAJE_CONFIGURACION_ROTA =
  'No se pudo enviar el aviso de prueba. Avísale a tu administrador.';

const esquemaToken = z.uuid();

/**
 * El resultado del paso 4.
 *
 * Es `ResultadoAccion` mas TRES campos opcionales, y los tres existen porque la
 * pantalla tiene que distinguir casos que un booleano no separa:
 *
 *   · `topeAgotado`      -> el bloque pasa al copy de §8.7 y el boton se apaga.
 *   · `suscripcionMuerta`-> el destino ya no existe: hay que reconectar, no
 *                           reintentar. Es el caso que el banner S4 arregla.
 *   · `codigo`           -> para diagnostico. Union CERRADA (`CodigoDePush`), no
 *                           texto libre: por ahi NO entra el cuerpo de la
 *                           respuesta del push service, que arrastra el endpoint
 *                           (T-05-04). Y no se pinta: no se le ensena un codigo
 *                           http a alguien de pie con el telefono en la mano.
 */
export type ResultadoDePruebaDeAviso = ResultadoAccion & {
  topeAgotado?: boolean;
  suscripcionMuerta?: boolean;
  codigo?: CodigoDePush;
};

/**
 * El guard, en la forma que permite escribirlo como PRIMERA linea de cada
 * action.
 *
 * ES EL MISMO de `app/(cleaner)/_actions.ts`, copiado en forma y no importado, y
 * la razon es de Next y no de gusto: aquel archivo tambien lleva `'use server'`,
 * y exportar de ahi una funcion asincrona la convertiria en un ENDPOINT HTTP
 * PUBLICO mas. Un guard reutilizable no puede vivir detras de una puerta que el
 * propio guard existe para cerrar.
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

/**
 * El error de base, tal cual.
 *
 * `mapDbError()` lee el `hint` de Postgres en `P0001`, no el `message`. Los dos
 * textos que importan aqui —el tope de §8.7 y el "todavia no se ha enviado
 * ninguno"— ya vienen redactados en espanol desde la migracion 16, asi que la
 * action solo tiene que dejarlos pasar. Reescribirlos aqui seria mantener el
 * mismo copy en dos sitios.
 */
function fallo(error: DbErrorLike): { ok: false; error: string } {
  return { ok: false, error: mapDbError(error) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1/3 — EL ENVIO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PWA-02. Manda un aviso de prueba al telefono de esta sesion.
 *
 * Viaja por LA MISMA TUBERIA que un aseo real —`construirPayload()`,
 * `claveDeColapso()`, `enviar()`, `decidir()`— incluida la rama de formato que
 * le toque al destino (D-07). Si viajara por un camino propio, verificaria un
 * camino que despues nadie usa.
 */
export async function enviarAvisoDePrueba(
  _prev: ResultadoDePruebaDeAviso | null,
  formData: FormData,
): Promise<ResultadoDePruebaDeAviso> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  // ── 2. VALIDACION ──────────────────────────────────────────────────────────
  // El mismo esquema que el registro: acota el destino a los hosts de push
  // conocidos. Aqui cierra lo mismo que alli (T-05-02), y ademas evita gastar
  // uno de los tres intentos contra una cadena que nunca iba a llegar.
  const parseado = esquemaEndpointDePush.safeParse(campo(formData, 'endpoint'));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };
  const endpoint = parseado.data;

  // ── 3. EL RPC QUE CUENTA EL INTENTO. VA ANTES DEL ENVIO ────────────────────
  // El tope de tres vive en la base, con `for update`. Ver la cabecera: invertir
  // este paso y el 5 deja el limite evadible reintentando (T-05-08).
  const { data: token, error: errorRegistro } = await ctx.supabase.rpc(
    'registrar_prueba_de_aviso',
    { p_endpoint: endpoint },
  );

  if (errorRegistro) {
    // `P0001` aqui solo puede ser una cosa: el tope agotado. `42501` es la otra
    // salida del RPC y cubre "no existe", "no es tuya" y "esta revocada" con el
    // MISMO codigo a proposito, para no ser un oraculo de enumeracion de
    // endpoints ajenos (T-05-14). Ninguno de los dos se reescribe.
    return {
      ...fallo(errorRegistro),
      ...(errorRegistro.code === 'P0001' ? { topeAgotado: true } : {}),
    };
  }
  if (typeof token !== 'string') return { ok: false, error: MENSAJE_CONFIGURACION_ROTA };

  // ── 4. LA PROPIA SUSCRIPCION, CON EL JWT DEL USUARIO ───────────────────────
  // Sin fabrica administrativa: la policy `push_subs_own_all` ya acota la
  // lectura a las filas de esta persona. Se leen TRES columnas y solo tres: las
  // dos claves de cifrado y la rama de formato. La columna de intentos NO entra
  // (ver la cabecera).
  const { data: sub, error: errorSub } = await ctx.supabase
    .from('push_subscriptions')
    .select('p256dh, auth, soporta_declarativo')
    .eq('endpoint', endpoint)
    .is('revoked_at', null)
    .maybeSingle();

  if (errorSub) return fallo(errorSub);
  if (!sub) return { ok: false, error: MENSAJE_SUSCRIPCION_MUERTA, suscripcionMuerta: true };

  // ── 5. EL PAYLOAD, Y SOLO ENTONCES EL ENVIO ────────────────────────────────
  const origen = origenDeLaAplicacion();
  if (origen === null) return { ok: false, error: MENSAJE_CONFIGURACION_ROTA };

  const topic = claveDeColapso({
    recipient_id: ctx.uid,
    // Ver `DISCRIMINADOR_DE_PRUEBA`: la separacion frente a una asignacion real
    // la da el discriminador, que es lo que `claveDeColapso()` mete en el
    // material del hash cuando no hay aseo.
    type: 'asignacion',
    cleaning_id: null,
    dedupe_key: DISCRIMINADOR_DE_PRUEBA,
    id: token,
  });

  let payload: string;
  try {
    payload = construirPayload(
      {
        id: token,
        type: 'asignacion',
        title: TITULO_DE_PRUEBA,
        body: CUERPO_DE_PRUEBA,
        // El destino que produce la confirmacion POR TOQUE. Es una ruta
        // relativa: `construirPayload()` la resuelve contra el origen y rechaza
        // cualquier cosa que saque al aseador de la aplicacion.
        url: `/instalar?prueba=${token}`,
      },
      { soportaDeclarativo: sub.soporta_declarativo === true, origen, tag: topic },
    );
  } catch {
    // Los tres errores de `construirPayload()` son codigos de lista cerrada y no
    // arrastran el payload. Aqui los tres significan lo mismo para el aseador:
    // esto no es culpa suya y no lo arregla reintentando.
    return { ok: false, error: MENSAJE_CONFIGURACION_ROTA, codigo: 'payload_excede_limite' };
  }

  let respuesta;
  try {
    respuesta = await enviar(
      { endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      {
        ttl: TTL_DE_PRUEBA_SEGUNDOS,
        // Alta, y explicita en vez de derivada: el aseador esta parado mirando la
        // pantalla y esperando a que suene. Es el caso de urgencia por
        // definicion.
        urgency: 'high',
        topic,
        timeoutMs: TIMEOUT_MS,
      },
    );
  } catch {
    // `enviar()` solo lanza si la configuracion de VAPID esta rota, y eso no lo
    // arregla el aseador.
    return { ok: false, error: MENSAJE_CONFIGURACION_ROTA, codigo: 'configuracion_rota' };
  }

  // ── 6. QUE DIJO EL PUSH SERVICE ────────────────────────────────────────────
  // El cuerpo de la respuesta entra a `decidir()` y NO SALE DE AHI: lo que viaja
  // hacia la pantalla es un codigo de union cerrada (T-05-04).
  const decision = decidir(respuesta.statusCode, respuesta.body, respuesta.headers, 1);

  if (decision.tipo === 'entregado') {
    // `Enviado.` y NO `Ya le llegó`. Aceptar no es entregar: el push service
    // acepto el mensaje, y si llego al telefono lo dice el toque, no esto
    // (§11.4).
    return { ok: true, mensaje: 'Enviado.' };
  }

  if (decision.tipo === 'desactivar_suscripcion') {
    // El destino ya no existe. Se marca muerta la suscripcion PROPIA: dos
    // columnas y solo dos, igual que la baja desde el telefono. `user_id` no
    // entra, la migracion 16 se lo quito al grant de update a proposito.
    await ctx.supabase
      .from('push_subscriptions')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: decision.motivo })
      .eq('endpoint', endpoint);

    return {
      ok: false,
      error: MENSAJE_SUSCRIPCION_MUERTA,
      suscripcionMuerta: true,
      codigo: decision.motivo,
    };
  }

  return { ok: false, error: MENSAJE_ENVIO_FALLIDO, codigo: decision.motivo };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2/3 — LA CONFIRMACION POR TOQUE (EL GRADO BUENO)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PWA-02, D-02. Consume el token con el que se abrio `/instalar?prueba={token}`.
 *
 * Es la unica evidencia de la fase que nadie pudo fabricar: el aviso se pinto en
 * la pantalla, era tocable, y alguien lo toco.
 *
 * ── CON UN TOKEN QUE EL RPC NO RECONOCE, ESTO **NO** ES UN ERROR ───────────
 *
 * El token es de un solo uso. El navegador puede reabrir la misma URL —un
 * refresco, un "atras", el sistema restaurando la pestana— y entonces el RPC
 * sale sin hacer nada y sin lanzar, por decision de la migracion 16. Convertir
 * ese reintento normal en una pantalla de error le mostraria al aseador un fallo
 * justo en el momento en que todo salio bien. Por eso el resultado es neutro.
 *
 * Quien decide lo que se pinta es el estado de verificacion que la pagina lee
 * del servidor, no esta respuesta.
 */
export async function confirmarPruebaPorToque(token: string): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaToken.safeParse(token);
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('confirmar_prueba_por_toque', {
    p_token: parseado.data,
  });
  if (error) return fallo(error);

  return { ok: true, mensaje: 'Listo.' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3/3 — LA CONFIRMACION A MANO (EL GRADO FLOJO)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PWA-02. `Ya sonó, no alcancé a tocarlo`.
 *
 * Existe porque el caso real es alguien acompanando el onboarding y un aviso que
 * se descarta sin querer. Y existe ACOTADA por las dos reglas que la migracion
 * 16 impone, que son las que impiden que sea un atajo:
 *
 *   1. Sin envio previo NO SE PUEDE. Confirmar a mano algo que nunca se mando
 *      seria inventarse la evidencia entera, no solo el grado. El RPC lanza
 *      `P0001` con su texto ya redactado.
 *   2. NO DEGRADA una confirmacion por toque. Si ya estaba confirmada por toque,
 *      el RPC sale sin hacer nada.
 *
 * Y la consecuencia que el aseador ve: este grado lo deja en `Sin probar` a ojos
 * del admin, y la pantalla de cierre se lo dice de frente.
 */
export async function confirmarPruebaAMano(endpoint: string): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaEndpointDePush.safeParse(endpoint);
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('confirmar_prueba_a_mano', {
    p_endpoint: parseado.data,
  });
  if (error) return fallo(error);

  return { ok: true, mensaje: 'Quedó confirmado.' };
}
