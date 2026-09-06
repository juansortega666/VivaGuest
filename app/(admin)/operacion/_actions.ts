'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { IDX_ONE_ACTIVE_PER_PROPERTY_DATE } from '@/lib/domain/constants';
import { formatFechaBog, hoyBog } from '@/lib/domain/dates';
import { campoDeConstraint, mapDbError, type DbErrorLike } from '@/lib/domain/errors';

/**
 * LAS NUEVE SERVER ACTIONS DE LA PANTALLA DE OPERACIÓN.
 *
 * ── EL ORDEN DE LAS TRES PRIMERAS OPERACIONES NO ES ESTILÍSTICO ─────────────
 *
 *   1. `exigirAdmin()`  — un Server Action es un endpoint HTTP PÚBLICO
 *   2. `safeParse()`    — lo mínimo, antes de tocar la base
 *   3. `ctx.supabase.rpc(...)` — SOLO entonces, y con el JWT del usuario
 *
 * Invertir 1 y 3 convierte cualquiera de estas actions en una escalada de
 * privilegios de una línea. Que el botón solo se renderice dentro del route
 * group `(admin)` no autoriza absolutamente nada: cualquiera con el id de la
 * action y el payload la invoca directamente. Mismo patrón y mismas palabras que
 * `app/(admin)/aseadores/_actions.ts`, que fijó la forma en la Fase 2.
 *
 * ── ESTA CAPA NO ES LA FRONTERA ────────────────────────────────────────────
 *
 * La frontera es `private.is_admin()` DENTRO de cada RPC (migración 15). Aunque
 * estos guards desaparecieran, un aseador recibiría `42501` de Postgres. Lo que
 * el guard compra es fallar temprano, con un mensaje en español, y no filtrar la
 * existencia de un recurso por la forma del error.
 *
 * ── NINGUNA CONSTRUYE LA FÁBRICA ADMINISTRATIVA, Y ES DELIBERADO ───────────
 *
 * Las seis RPC del admin son `SECURITY DEFINER` y traen su propia guarda de rol
 * por dentro. Meter acá un cliente que salta la RLS no habilitaría nada nuevo y
 * sí convertiría este archivo en una escalada de privilegios de una línea el día
 * que alguien borrara un `exigirAdmin()`. `scripts/ci/check-service-role.sh`
 * rompe el build si `lib/supabase/admin.ts` aparece por acá, y además hace grep
 * del nombre literal de la variable de entorno de la clave de servicio: ese
 * nombre NO se escribe en este archivo, ni siquiera dentro de un comentario. Ya
 * pasó dos veces en la Fase 1.
 *
 * ── LAS CLAVES DEL `FormData` SON CONTRATO CON LOS DIÁLOGOS ────────────────
 *
 *   aseo_id · aseador_id · aseador_nombre · apartamento_id · apartamento_nombre
 *   fecha · tipo · huespedes · instrucciones
 *
 * Los dos `*_nombre` no viajan a la base: son SOLO para el copy. El nombre del
 * apartamento es lo que permite interpolar el error de ASEO-07, porque
 * `mapDbError()` ve el error de Postgres y nada más (ver `errorDeAseoDuplicado`).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COPY
//
// PROHIBICIÓN EXPLÍCITA Y ES DE PRODUCTO (UI-SPEC §18.1): ningún mensaje de esta
// fase puede decir ni sugerir que se le avisó al aseador. Confirmar asigna en
// firme y escribe el evento en la cola de `notifications`, pero NADIE LA DRENA
// HASTA LA FASE 5. Nada de `Se le notificó a María`, `El aseador ya fue avisado`
// ni `Le llegó la asignación`. El copy correcto dice a quién quedó asignado el
// aseo, no que se le avisó. Hay un test que recorre los nueve mensajes de éxito
// buscando esas palabras.
// ═══════════════════════════════════════════════════════════════════════════════

const MENSAJE_DATOS_INVALIDOS = 'Datos inválidos.';

/**
 * Mensaje interpolado de ASEO-07 (UI-SPEC §12.6 y §18.1). Literal del contrato.
 */
function mensajeAseoDuplicado(apartamento: string, fecha: string): string {
  return `Ya hay un aseo activo para ${apartamento} el ${formatFechaBog(fecha)}. Reprograma el que existe o cancélalo antes de crear otro.`;
}

/**
 * Los `P0001` cuyo `hint` de la base NO es el copy que el contrato de la pantalla
 * exige, indexados por el token de la excepción.
 *
 * Es UNA sola entrada y por eso no vive en `lib/domain/errors.ts`: el hint de
 * `sin_responsable` nombra la columna `responsable_id`, que es lenguaje de
 * schema, y §18.1 fija el texto que ve el admin. Todos los demás `P0001` salen
 * con su `hint` tal cual, que ya viene redactado en español desde la migración.
 */
const COPY_POR_TOKEN: ReadonlyArray<readonly [string, string]> = [
  ['sin_responsable', 'Este apartamento no tiene responsable. Asígnalo antes de confirmar.'],
];

/** Traducción de un error de la base al contrato `ResultadoAccion`. */
function fallo(error: DbErrorLike): { ok: false; error: string; campo?: string } {
  if (error.code === 'P0001') {
    for (const [token, copy] of COPY_POR_TOKEN) {
      if (error.message === token) return { ok: false, error: copy };
    }
  }
  return { ok: false, error: mapDbError(error), campo: campoDeConstraint(error.message) };
}

/**
 * El caso de ASEO-07, detectado ANTES de delegar en `mapDbError()`.
 *
 * `mapDbError()` es una función pura de mapeo: solo ve el error de Postgres, no
 * conoce el nombre del apartamento ni la fecha, y NO debe conocerlos. La action
 * sí los tiene, porque vienen en el `FormData` del diálogo, así que la
 * interpolación se hace acá.
 *
 * Sin nombre de apartamento se cae al genérico de `mapDbError()`. Sigue yendo
 * bajo el campo `fecha`, porque `campoDeConstraint()` mapea ese índice desde el
 * plan 04-03: el mensaje pierde el nombre del apartamento, no el sitio donde se
 * pinta. Es mejor que un toast, y es corregible sin cerrar el diálogo.
 *
 * Devuelve `null` si el error no es este caso, para que el llamador siga.
 */
function errorDeAseoDuplicado(
  error: DbErrorLike,
  apartamento: string | null,
  fecha: string,
): { ok: false; error: string; campo?: string } | null {
  const esDuplicado =
    error.code === '23505' &&
    (error.message ?? '').includes(IDX_ONE_ACTIVE_PER_PROPERTY_DATE);

  if (!esDuplicado) return null;
  if (!apartamento) return fallo(error);

  return { ok: false, error: mensajeAseoDuplicado(apartamento, fecha), campo: 'fecha' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDACIÓN
//
// Los esquemas validan LO MÍNIMO que la base ya exige y nada más: uuid para los
// ids, `YYYY-MM-DD` con `min = hoyBog()` para las fechas, entero >= 1 para
// huéspedes (`num_huespedes > 0`, migración 04) y `repaso | emergencia` para el
// tipo (`create_manual_cleaning` rechaza `normal`). Duplicar acá una regla de
// negocio que ya vive en un CHECK es cómo aparecen dos verdades ligeramente
// distintas, y la que se queda atrás lo hace en silencio.
// ═══════════════════════════════════════════════════════════════════════════════

const uuid = z.uuid();

/**
 * Día de negocio en la forma `YYYY-MM-DD`, de hoy en adelante.
 *
 * La comparación es LEXICOGRÁFICA sobre la cadena, no sobre un objeto de fecha:
 * en formato ISO de ancho fijo el orden de cadena y el de calendario coinciden, y
 * construir un `Date` acá reintroduciría el desfase de un día que
 * `lib/domain/dates.ts` existe para evitar. `hoyBog()` es el equivalente en
 * TypeScript de `public.today_bog()`, que es quien decide de verdad dentro de la
 * RPC.
 */
const fechaDeNegocio = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((f) => f >= hoyBog());

/** Texto opcional de un `textarea`: vacío o solo espacios es `null`, no `''`. */
const textoOpcional = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  });

/** Nombre que solo alimenta el copy. Nunca viaja a la base. */
const nombreParaCopy = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  });

const esquemaConfirmar = z.object({
  aseo_id: uuid,
  // `coerce` porque un `FormData` solo transporta cadenas. `smallint` en la base.
  huespedes: z.coerce.number().int().min(1).max(32767),
  instrucciones: textoOpcional,
});

const esquemaReasignar = z.object({
  aseo_id: uuid,
  aseador_id: uuid,
  aseador_nombre: nombreParaCopy,
});

const esquemaCrear = z.object({
  apartamento_id: uuid,
  fecha: fechaDeNegocio,
  // `normal` NO es una opción: los aseos normales los crea el motor de calendario
  // (UI-SPEC §12.3). Ofrecerlo sería invitar a duplicar lo que el sync ya hace.
  tipo: z.enum(['repaso', 'emergencia']),
  apartamento_nombre: nombreParaCopy,
});

const esquemaReprogramar = z.object({
  aseo_id: uuid,
  fecha: fechaDeNegocio,
  apartamento_nombre: nombreParaCopy,
});

const esquemaSoloAseo = z.object({ aseo_id: uuid });

/** Lo que `FormData.get` devuelve, normalizado a lo que zod puede leer. */
function campos(formData: FormData, claves: readonly string[]): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const clave of claves) {
    const valor = formData.get(clave);
    salida[clave] = typeof valor === 'string' ? valor : null;
  }
  return salida;
}

/**
 * El guard, en la forma que permite escribirlo como PRIMERA línea de cada action.
 *
 * Devuelve el contexto, o el `ResultadoAccion` de rechazo. Cualquier error que no
 * sea `NoAutorizado` SE RELANZA: un GoTrue caído no es "no tienes permiso", y
 * disfrazarlo mandaría al admin a pedir permisos que ya tiene.
 */
async function guard(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof exigirAdmin>>['supabase']; uid: string }
  | { ok: false; error: string }
> {
  try {
    const { supabase, user } = await exigirAdmin();
    return { ok: true, supabase, uid: user.id };
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAS SIETE ACTIONS DE MUTACIÓN DE ASEO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ASEO-02 / ASEO-03. Confirma el aseo y lo asigna EN FIRME al responsable fijo
 * del apartamento, que es quien elige la RPC: la action no manda aseador.
 */
export async function confirmarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  // ── 2. VALIDACIÓN ───────────────────────────────────────────────────────────
  const parseado = esquemaConfirmar.safeParse(
    campos(formData, ['aseo_id', 'huespedes', 'instrucciones']),
  );
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  // ── 3. SOLO AHORA, LA BASE, CON EL JWT DEL USUARIO ──────────────────────────
  const { error } = await ctx.supabase.rpc('confirm_cleaning', {
    p_cleaning: parseado.data.aseo_id,
    p_num_huespedes: parseado.data.huespedes,
    // EL CAST ES NECESARIO Y NO ES UN PARCHE. `supabase gen types` deriva los
    // argumentos de una función de `pg_proc`, donde la nulabilidad de un
    // parámetro NO se puede expresar: todo `text` sale tipado `string`. Pero
    // `instrucciones` es una columna nullable y la RPC la asigna tal cual, así
    // que mandar `''` en vez de `null` guardaría una cadena vacía donde el resto
    // del sistema espera ausencia de dato.
    p_instrucciones: parseado.data.instrucciones as unknown as string,
  });
  if (error) return fallo(error);

  revalidatePath('/operacion');
  return { ok: true, mensaje: 'Aseo confirmado.' };
}

/**
 * ASEO-04. Cambia QUIÉN HACE ESTE ASEO. No toca el responsable ni el suplente del
 * apartamento (D-18): eso vive en el CRUD del catálogo y es otra pantalla.
 */
export async function reasignarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaReasignar.safeParse(
    campos(formData, ['aseo_id', 'aseador_id', 'aseador_nombre']),
  );
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('reassign_cleaning', {
    p_cleaning: parseado.data.aseo_id,
    p_aseador: parseado.data.aseador_id,
  });
  if (error) return fallo(error);

  revalidatePath('/operacion');

  const nombre = parseado.data.aseador_nombre;
  return {
    ok: true,
    mensaje: nombre ? `El aseo quedó asignado a ${nombre}.` : 'El aseo quedó reasignado.',
  };
}

/**
 * ASEO-05. Aseo manual de repaso o emergencia.
 *
 * El aseo nace SIN CONFIRMAR y cae en la bandeja, igual que uno del sync
 * (ASEO-01), así que la action no pide huéspedes ni instrucciones. El mensaje de
 * éxito DICE DÓNDE QUEDÓ a propósito: el aseo recién creado no aparece en la
 * tabla del día si el día está colapsado, y sin esa frase el admin cree que no
 * se creó nada.
 */
export async function crearAseoManual(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaCrear.safeParse(
    campos(formData, ['apartamento_id', 'fecha', 'tipo', 'apartamento_nombre']),
  );
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { fecha, apartamento_nombre } = parseado.data;

  const { error } = await ctx.supabase.rpc('create_manual_cleaning', {
    p_property: parseado.data.apartamento_id,
    p_fecha: fecha,
    p_tipo: parseado.data.tipo,
  });

  if (error) return errorDeAseoDuplicado(error, apartamento_nombre, fecha) ?? fallo(error);

  revalidatePath('/operacion');
  return { ok: true, mensaje: 'Aseo creado. Está en la bandeja Sin confirmar.' };
}

/**
 * ASEO-06. Mueve el aseo de fecha.
 *
 * CONSECUENCIA ACEPTADA Y MEDIDA (plan 04-07): la RPC desapunta la reserva en la
 * misma sentencia, así que el siguiente sync creará un aseo NUEVO, sin confirmar,
 * en la fecha del checkout real. Reprogramar produce DOS aseos, y el de más cae
 * en la bandeja donde el admin lo ve y lo cancela en diez segundos. Está
 * afirmado en `lib/domain/aseos-admin.integration.test.ts`, no solo comentado:
 * un aseo de más lo revisa un humano, uno de menos deja a la aseadora en la calle.
 */
export async function reprogramarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaReprogramar.safeParse(
    campos(formData, ['aseo_id', 'fecha', 'apartamento_nombre']),
  );
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { fecha, apartamento_nombre } = parseado.data;

  const { error } = await ctx.supabase.rpc('reschedule_cleaning', {
    p_cleaning: parseado.data.aseo_id,
    p_fecha: fecha,
  });

  if (error) return errorDeAseoDuplicado(error, apartamento_nombre, fecha) ?? fallo(error);

  revalidatePath('/operacion');
  return { ok: true, mensaje: `El aseo quedó para el ${formatFechaBog(fecha)}.` };
}

/** ASEO-08. Cierre manual: queda terminado, sin checklist y sin fotos. */
export async function cerrarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaSoloAseo.safeParse(campos(formData, ['aseo_id']));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('close_cleaning', {
    p_cleaning: parseado.data.aseo_id,
  });
  if (error) return fallo(error);

  revalidatePath('/operacion');
  return { ok: true, mensaje: 'El aseo quedó cerrado.' };
}

/** ASEO-09. Cancela el aseo. Sin "Deshacer": reactivar un cancelado no existe. */
export async function cancelarAseo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaSoloAseo.safeParse(campos(formData, ['aseo_id']));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('cancel_cleaning', {
    p_cleaning: parseado.data.aseo_id,
  });
  if (error) return fallo(error);

  revalidatePath('/operacion');
  return { ok: true, mensaje: 'El aseo quedó cancelado.' };
}

/**
 * Apaga `needs_review`. Es la superficie de `clear_review_flag`.
 *
 * La migración 13 promete que la marca es pegajosa y que "solo el admin la apaga,
 * en la Fase 4". Sin esta action, la señal `Flag` de la fila se queda encendida
 * para siempre y el admin aprende a ignorarla, que es cómo muere una alerta.
 */
export async function limpiarMarcaDeRevision(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaSoloAseo.safeParse(campos(formData, ['aseo_id']));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('clear_review_flag', {
    p_cleaning: parseado.data.aseo_id,
  });
  if (error) return fallo(error);

  revalidatePath('/operacion');
  return { ok: true, mensaje: 'El aseo quedó marcado como revisado.' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EL PANEL DE ALERTAS (UI-SPEC §11.4)
//
// ── POR QUÉ ACÁ NO HACE FALTA UNA RPC ──────────────────────────────────────
// `notifications` sí tiene `grant select, update` para `authenticated`
// (migración 07) y la policy `notifications_own_update` acota a
// `recipient_id = auth.uid()` con `using` Y con `with check` (migración 08). Ese
// `with check` es el que impide reasignarse una notificación ajena cambiando la
// columna del destinatario. Escribir una RPC acá sería construir a mano lo que la
// base ya hace, y con más superficie.
//
// ── LA TRAMPA, Y ES LA RAZÓN DEL TEST ──────────────────────────────────────
// EL GRANT ES DE TABLA, NO POR COLUMNA, y la policy acota QUÉ FILAS, no QUÉ
// COLUMNAS. Un `update` que pase el objeto entero puede sobrescribir `title`,
// `body`, `url` o `payload` sin que la base diga una palabra. La disciplina de
// escribir UNA SOLA columna es de estas dos funciones, no de Postgres, y por eso
// hay un test unitario sobre el objeto que llega a `.update()` y otro de
// integración que lee las cuatro columnas antes y después.
//
// `notifications` NO tiene policy ni grant de INSERT para nadie: solo escriben
// filas las RPC `SECURITY DEFINER` y el motor de sync. El vector de
// `notifications.url` como texto libre inyectable sigue cerrado y ESTA FASE NO LO
// ABRE.
//
// `read_at` significa ATENDIDA en este producto, no "leída" (UI-SPEC §11.4). La
// Fase 5 va a querer la misma columna para el push y las dos semánticas conviven
// mal; queda anotado antes de que sea una sorpresa.
// ═══════════════════════════════════════════════════════════════════════════════

/** El `UPDATE` de una sola columna, compartido por las dos actions del panel. */
async function escribirMarcaDeAtendida(
  id: string,
  readAt: string | null,
  mensaje: string,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = uuid.safeParse(id);
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { data, error } = await ctx.supabase
    .from('notifications')
    // UNA SOLA CLAVE. Ver el bloque de arriba: no añadir `title`, `body`, `url`
    // ni `payload` "para que quede completo".
    .update({ read_at: readAt })
    .eq('id', parseado.data)
    .select('id');

  if (error) return fallo(error);

  // Cero filas = la alerta no existe o es de otro destinatario, y la policy la
  // dejó fuera sin levantar error. Devolverlo como éxito dejaría al panel del
  // plan 04-13 con su estado optimista aplicado sobre algo que nunca se escribió.
  if (!data || data.length === 0) {
    return { ok: false, error: 'No se encontró el registro solicitado.' };
  }

  revalidatePath('/operacion');
  return { ok: true, mensaje };
}

/** Saca la alerta del panel. `read_at` = ahora. */
export async function marcarAlertaAtendida(id: string): Promise<ResultadoAccion> {
  return escribirMarcaDeAtendida(id, new Date().toISOString(), 'Alerta marcada como atendida.');
}

/** El `Devolver al panel` del toggle `Ver atendidas`. `read_at` = null. */
export async function devolverAlertaAlPanel(id: string): Promise<ResultadoAccion> {
  return escribirMarcaDeAtendida(id, null, 'La alerta volvió al panel.');
}
