'use server';

import 'server-only';

import { z } from 'zod';

import { NoAutorizado, exigirSesion } from '@/lib/auth/guards';
import { firmarSubida, registrarFoto, type VinculoDeFoto } from '@/lib/data/evidencia';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { mapDbError, type DbErrorLike } from '@/lib/domain/errors';
import { MOTIVOS_SKIP, exigeNota, type MotivoSkip } from '@/lib/domain/motivos';

/**
 * LA UNICA RUTA DE SALIDA DEL CODIGO DE ACCESO HACIA EL TELEFONO DEL ASEADOR.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL ORDEN, IGUAL QUE EN EL RESTO DE ACTIONS DEL ARBOL:
 *
 *   1. `exigirSesion()`  — un Server Action es un endpoint HTTP PUBLICO
 *   2. `safeParse()`     — lo minimo, antes de hablar con la base
 *   3. el RPC            — SOLO entonces, y con el JWT del usuario
 *
 * Aqui el guard es `exigirSesion()` y no el que ademas exige rol de
 * administrador: esto lo llama un aseador. El nombre de aquel otro guard no se
 * escribe en este archivo ni en prosa, porque el criterio que lo vigila es un
 * grep sin filtro de comentarios.
 *
 * ── POR QUE UN RPC Y NO UNA LECTURA ────────────────────────────────────────
 *
 * `reveal_access_code()` (migracion 09) es la unica puerta, y no por estilo. Un
 * `select` directo sobre la tabla donde vive el codigo devuelve `42501` incluso
 * para un admin: esa tabla no tiene NINGUN grant para `authenticated`, asi que
 * es inalcanzable por construccion y no por una policy. Su nombre no se escribe
 * en este archivo, ni siquiera dentro de un comentario; el guardarrail 8 de
 * `scripts/ci/check-service-role.sh` lo vigila por grep.
 *
 * Lo que el RPC suma y una policy de lectura no daria:
 *
 *   * ventana temporal estrecha: hoy y manana, anclada al aseo y no al
 *     apartamento
 *   * rastro de auditoria escrito en la MISMA transaccion, ANTES del return
 *     (T-01-48): no puede existir lectura de codigo sin rastro
 *   * un unico sitio donde endurecer la regla
 *
 * Y NUNCA la fabrica administrativa: el RPC autoriza contra `auth.uid()`, asi
 * que llamarlo saltandose la RLS lo convertiria en una funcion que revela el
 * codigo de cualquier apartamento a cualquiera.
 *
 * ── LA CONTRAPARTIDA DE D-06 ───────────────────────────────────────────────
 *
 * D-06 saco el codigo del payload de la notificacion push precisamente para que
 * siguiera saliendo por aqui, con su ventana y su rastro. Lo que esta action
 * devuelve vive en memoria del componente y no se persiste en ninguna capa del
 * cliente; la regla esta escrita en `CodigoDeAcceso.tsx`, que es donde se puede
 * romper.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * O trae el codigo, o trae el error. NUNCA los dos.
 *
 * Es una union y no un objeto de campos opcionales para que sea imposible
 * renderizar un codigo al lado de un mensaje de fallo: ese codigo seria el de un
 * intento anterior, o sea un secreto mostrado fuera de la unica ruta que lo
 * audita.
 *
 * Y devuelve SOLO el codigo, aunque el RPC entregue tres columnas. El tipo de
 * cerradura y las notas no los pinta esta pantalla (§9.3), y lo que no viaja no
 * se puede filtrar.
 */
export type ResultadoCodigo =
  | { ok: true; codigo: string }
  | { ok: false; error: string };

const esquemaAseo = z.uuid();

/**
 * El mensaje de los TRES casos indistinguibles.
 *
 * `mapDbError()` devuelve un texto que NO nombra el recurso para `42501`, y eso
 * es exactamente lo que hace falta: la migracion 09 lanza ese codigo —y no
 * `P0001`— para "no existe", "no es tuyo" y "todavia no es su dia", porque un
 * error que los discriminara seria un ORACULO DE ENUMERACION DE ASEOS AJENOS.
 * Escribir aqui tres mensajes distintos, por amabilidad, devolveria el oraculo
 * por la puerta de atras. Hay un test que compara los tres y afirma que son la
 * misma cadena.
 */
function fallo(error: DbErrorLike): { ok: false; error: string } {
  return { ok: false, error: mapDbError(error) };
}

/**
 * Cuando el RPC autoriza pero no hay nada que entregar.
 *
 * Pasa si el apartamento todavia no tiene codigo guardado. El rastro de
 * auditoria SI queda escrito —el RPC inserta antes de devolver— y eso es
 * correcto: alguien pidio el codigo. Lo que no es correcto es pintar una caja de
 * 28px vacia, que el aseador leeria como un fallo de la app estando de pie
 * frente a la puerta.
 */
const MENSAJE_SIN_CODIGO =
  'Este apartamento todavía no tiene código guardado. Avísale a tu administrador.';

const MENSAJE_DATOS_INVALIDOS = 'Datos invalidos.';

/**
 * Revela el codigo de acceso de un aseo propio, dejando rastro.
 *
 * Cada llamada que autoriza escribe una fila de auditoria. No es un efecto
 * secundario que se pueda optimizar: es el producto. Por eso la pantalla, una
 * vez revelado, NO vuelve a llamar y NO se auto-oculta (§9.3): cada re-peticion
 * seria otra fila.
 */
export async function revelarCodigo(
  _prev: ResultadoCodigo | null,
  formData: FormData,
): Promise<ResultadoCodigo> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  let supabase;
  try {
    ({ supabase } = await exigirSesion());
  } catch (e) {
    // Cualquier error que no sea `NoAutorizado` SE RELANZA: un GoTrue caido no
    // es "no tienes permiso", y disfrazarlo mandaria al aseador a pedirle al
    // admin unos permisos que ya tiene.
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }

  // ── 2. VALIDACION ──────────────────────────────────────────────────────────
  const valor = formData.get('aseo');
  const parseado = esquemaAseo.safeParse(typeof valor === 'string' ? valor : '');
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  // ── 3. SOLO AHORA, EL RPC, CON EL JWT DEL USUARIO ──────────────────────────
  // Un solo argumento y es el ASEO. No se manda ningun dato del apartamento a
  // proposito: la autorizacion se ancla a un trabajo concreto asignado, no a
  // "tener algun trabajo en ese apartamento". Es lo que hace que un aseo a cinco
  // dias NO revele el codigo aunque el apartamento si sea visible.
  const { data, error } = await supabase.rpc('reveal_access_code', {
    p_cleaning: parseado.data,
  });

  if (error) return fallo(error);

  const codigo = data?.[0]?.codigo_acceso ?? null;
  if (codigo === null || codigo.trim().length === 0) {
    return { ok: false, error: MENSAJE_SIN_CODIGO };
  }

  return { ok: true, codigo };
}


// ═══════════════════════════════════════════════════════════════════════════════
// LA EJECUCION DEL ASEO — Fase 6
//
// Todas repiten el mismo orden, y NO es estilistico:
//
//     1. exigirSesion()  — un Server Action es un endpoint HTTP PUBLICO, exista
//                          o no una pantalla que lo llame
//     2. safeParse()     — lo minimo, antes de tocar la base
//     3. el RPC          — SOLO entonces, y con el JWT del usuario
//
// Ninguna construye la fabrica administrativa. Ninguna nombra la tabla de
// secretos. Y ninguna usa `revalidatePath`: es un bug medido que cuelga el
// navegador (plan 04-14). El refresco lo pide `router.refresh()` en el cliente.
// ═══════════════════════════════════════════════════════════════════════════════

/** El guard, en la forma que este arbol ya usa. */
async function sesion() {
  try {
    const { supabase, user } = await exigirSesion();
    return { ok: true as const, supabase, uid: user.id };
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false as const, error: e.message };
    throw e;
  }
}

const esquemaTipoEvidencia = z.enum(['checklist', 'dano', 'gasto', 'faltante']);
const esquemaMotivo = z.enum(MOTIVOS_SKIP as unknown as [MotivoSkip, ...MotivoSkip[]]);

const MENSAJE_SUBIDA_FALLIDA = 'No se pudo subir la foto.';

export type ResultadoDeFirma =
  | { ok: true; ruta: string; token: string }
  | { ok: false; error: string };

/**
 * Pide permiso de subida para una ruta que compone EL SERVIDOR.
 *
 * El cliente manda el aseo y el tipo; **no manda ni puede proponer la ruta**. En
 * un bucket privado el nombre del archivo es una autorizacion.
 */
export async function pedirSubidaDeFoto(
  _prev: ResultadoDeFirma | null,
  formData: FormData,
): Promise<ResultadoDeFirma> {
  const ctx = await sesion();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const aseo = esquemaAseo.safeParse(formData.get('aseo'));
  const tipo = esquemaTipoEvidencia.safeParse(formData.get('tipo'));
  if (!aseo.success || !tipo.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { permiso, error } = await firmarSubida(ctx.supabase, {
    cleaningId: aseo.data,
    tipo: tipo.data,
  });
  if (!permiso || error) return { ok: false, error: MENSAJE_SUBIDA_FALLIDA };

  return { ok: true, ruta: permiso.ruta, token: permiso.token };
}

/**
 * Registra la foto ya subida y, si ese cuarto estaba saltado, le quita la marca.
 *
 * **La evidencia llego, la excusa sobra** (§8.4). Por eso el `unskip` va aqui y
 * no en un boton aparte: nadie se acuerda de deshacer una excusa a mano.
 */
export async function registrarFotoDeCuarto(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await sesion();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const aseo = esquemaAseo.safeParse(formData.get('aseo'));
  const item = esquemaAseo.safeParse(formData.get('item'));
  const cuarto = esquemaAseo.safeParse(formData.get('cuarto'));
  const ruta = z.string().min(1).safeParse(formData.get('ruta'));
  const bytes = z.coerce.number().int().positive().safeParse(formData.get('bytes'));
  const ancho = z.coerce.number().int().positive().safeParse(formData.get('ancho'));
  const alto = z.coerce.number().int().positive().safeParse(formData.get('alto'));

  if (!aseo.success || !item.success || !ruta.success || !bytes.success
      || !ancho.success || !alto.success) {
    return { ok: false, error: MENSAJE_DATOS_INVALIDOS };
  }

  const vinculo: VinculoDeFoto = { tipo: 'checklist', checklistItemId: item.data };

  const registro = await registrarFoto(ctx.supabase, {
    cleaningId: aseo.data,
    vinculo,
    uploadedBy: ctx.uid,
    metadatos: {
      storagePath: ruta.data,
      bytes: bytes.data,
      width: ancho.data,
      height: alto.data,
      mimeType: 'image/jpeg',
    },
  });

  if (registro.estado === 'error') return { ok: false, error: MENSAJE_SUBIDA_FALLIDA };

  // `ya_registrada` se trata como exito: es el reintento por mala senal, y la
  // idempotencia la da `storage_path unique`.
  if (cuarto.success) {
    await ctx.supabase.rpc('unskip_room_evidence', {
      p_cleaning: aseo.data,
      p_room: cuarto.data,
    });
  }

  return { ok: true, mensaje: 'Foto guardada.' };
}

/**
 * Salta la evidencia de un cuarto, con motivo de lista cerrada.
 *
 * El motivo `otro` exige nota, y eso se valida aqui **y** en la base
 * (`crs_otro_exige_nota`). Dos capas: esta es cortesia de pantalla, la de la
 * base es el control.
 */
export async function saltarCuarto(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await sesion();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const aseo = esquemaAseo.safeParse(formData.get('aseo'));
  const cuarto = esquemaAseo.safeParse(formData.get('cuarto'));
  const motivo = esquemaMotivo.safeParse(formData.get('motivo'));
  const notaCruda = formData.get('nota');
  const nota = typeof notaCruda === 'string' ? notaCruda.trim() : '';

  if (!aseo.success || !cuarto.success || !motivo.success) {
    return { ok: false, error: MENSAJE_DATOS_INVALIDOS };
  }
  if (exigeNota(motivo.data) && nota.length === 0) {
    return { ok: false, error: 'Cuentale al administrador que paso.', campo: 'nota' };
  }

  const { error } = await ctx.supabase.rpc('skip_room_evidence', {
    p_cleaning: aseo.data,
    p_room: cuarto.data,
    p_motivo: motivo.data,
    ...(nota.length > 0 ? { p_nota: nota } : {}),
  });
  if (error) return fallo(error);

  return { ok: true, mensaje: 'Listo.' };
}

/** Marca o desmarca una tarea. Envuelve el RPC que existe desde la migracion 09. */
export async function marcarTarea(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await sesion();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const item = esquemaAseo.safeParse(formData.get('item'));
  const hecha = z.enum(['true', 'false']).safeParse(formData.get('hecha'));
  if (!item.success || !hecha.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('toggle_checklist_item', {
    p_item: item.data,
    p_done: hecha.data === 'true',
  });
  if (error) return fallo(error);

  return { ok: true, mensaje: 'Guardado.' };
}

/**
 * Termina el aseo.
 *
 * ── AQUI NO SE REVALIDA EL CHECKLIST, Y ES DELIBERADO ───────────────────────
 *
 * `finish_cleaning` dejo de rechazar por checklist incompleto en la migracion 18
 * (D-06). **Reponer aqui una comprobacion de progreso reintroduciria el bloqueo
 * por la puerta de atras**, que es exactamente lo que se derogo: un bloqueo deja
 * al aseador atrapado en campo y termina en una llamada telefonica.
 *
 * La falta de evidencia se hace visible con `aseo_sin_evidencia_completa()`, no
 * impidiendo terminar.
 */
export async function terminarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await sesion();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const aseo = esquemaAseo.safeParse(formData.get('aseo'));
  if (!aseo.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('finish_cleaning', { p_cleaning: aseo.data });
  if (error) return fallo(error);

  // El mensaje dice lo que paso, no que se le aviso a nadie: el drenaje es
  // asincrono y esta action no sabe si el aviso llego (regla de 05-UI-SPEC §11.4).
  return { ok: true, mensaje: 'Aseo terminado.' };
}
