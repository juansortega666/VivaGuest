'use server';

import 'server-only';

import { z } from 'zod';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { mapDbError, type DbErrorLike } from '@/lib/domain/errors';
import { formatCOP } from '@/lib/domain/money';

/**
 * LAS DOS SERVER ACTIONS DE `/finanzas/pagos`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * NINGUNA PIDE REVALIDACIÓN DE RUTA, Y NO ES UN OLVIDO. ESTÁ MEDIDO.
 *
 * (El nombre literal de esa utilidad de Next NO se escribe en este archivo ni en
 * ninguno de esta sección, y no es manía: el criterio de aceptación de este plan
 * es un `grep` sobre `app/(admin)/finanzas` que tiene que dar cero. En este repo
 * ya han mordido cuatro veces los comentarios que citan el token que un grep
 * vigila. La referencia por descripción cuesta seis palabras.)
 *
 * Con esa llamada dentro de una Server Action del árbol de `(admin)`, **el
 * navegador se queda colgado**: la mutación se escribe en la base, el servidor
 * responde 200 con la carga útil completa en ~50 ms, y el cliente no la aplica
 * NUNCA. Lo que ve el admin es el botón en su gerundio para siempre, sin aviso,
 * sin cierre del diálogo y con la fila intacta. La única salida es recargar a
 * mano. Reproducido y acotado por bisección el 2026-09-06 (plan 04-14) sobre
 * `next@15.5.24` con el build de producción; el disparador es el TAMAÑO del
 * árbol de cliente, y esta pantalla es de las grandes.
 *
 * QUÉ SE PIERDE: nada observable. `(admin)/layout.tsx` declara render dinámico,
 * así que esta ruta no tiene caché de ruta completa que invalidar, y el único
 * consumidor es el admin que acaba de pulsar el botón.
 *
 * QUÉ LO SUSTITUYE: `router.refresh()` desde el cliente, que no pasa por la
 * transición de la action.
 *
 * Y ESTO SOLO SE VE CON EL BUILD DE PRODUCCIÓN Y PLAYWRIGHT. Ni el servidor de
 * desarrollo ni los tests de integración lo detectan: por eso los casos 8 a 11
 * de `e2e/finanzas.spec.ts` son parte de la verificación de este archivo y no un
 * extra.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL ORDEN DE LAS TRES PRIMERAS OPERACIONES NO ES ESTILÍSTICO ────────────
 *
 *   1. `exigirAdmin()`  — un Server Action es un endpoint HTTP PÚBLICO
 *   2. `safeParse()`    — lo mínimo, antes de tocar la base
 *   3. `ctx.supabase.rpc(...)` — SOLO entonces, y con el JWT del usuario
 *
 * Invertir 1 y 3 convierte cualquiera de las dos en una escalada de privilegios
 * de una línea (T-07-58). Que el botón viva en `(admin)` no autoriza nada:
 * cualquiera con el id de la action y el payload la invoca directamente, y aquí
 * lo que hay al otro lado es una marca irreversible sobre dinero.
 *
 * ── ESTA CAPA NO ES LA FRONTERA ───────────────────────────────────────────
 *
 * La frontera es `private.is_admin()` DENTRO de los dos RPC (migraciones 25 y
 * 27), que consulta `profiles` EN VIVO y no un claim del token: un admin
 * degradado hace un minuto no puede registrar un pago con su token todavía sin
 * expirar. Aunque estos guards desaparecieran, un aseador recibiría `42501`. Lo
 * que el guard compra es fallar temprano, con un mensaje en español, y no
 * filtrar la existencia de un recurso por la forma del error.
 *
 * ── Y LAS DOS DEVUELVEN UN RESULTADO QUE EL CLIENTE TIENE QUE LEER ────────
 *
 * El defecto del 2026-09-11 fue invisible durante semanas porque nadie miraba el
 * `ok`: el servidor devolvía fallo y la pantalla decía que todo estaba bien. Con
 * dinero de por medio eso sería marcar como pagado algo que no se guardó, y el
 * admin haría la transferencia creyendo que ya quedó constancia.
 */

const uuid = z.uuid();

/** Un día de negocio `'YYYY-MM-DD'`, que es como viajan las fechas del periodo. */
const diaDeNegocio = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const esquemaPago = z.object({ pago_id: uuid });
const esquemaPeriodo = z.object({ desde: diaDeNegocio, hasta: diaDeNegocio });

const MENSAJE_DATOS_INVALIDOS = 'Datos inválidos.';

/**
 * Los `P0001` cuyo `hint` de la base NO es el copy que el contrato de la
 * pantalla exige, indexados por el token de la excepción.
 *
 * `marcar_pago_pagado` levanta `pago_ya_marcado` con un hint que habla de
 * pestañas; §12.3 fija el texto que ve el admin. Los demás `P0001` de estos dos
 * RPC (`pago_no_encontrado`, `periodo_invalido`, `periodo_no_vencido`) salen con
 * su hint tal cual, que ya viene redactado en español desde la migración.
 */
const COPY_POR_TOKEN: ReadonlyArray<readonly [string, string]> = [
  ['pago_ya_marcado', 'Ese pago ya estaba marcado. Recarga la página.'],
];

/** Traducción de un error de la base al contrato `ResultadoAccion`. */
function fallo(error: DbErrorLike): { ok: false; error: string } {
  if (error.code === 'P0001') {
    for (const [token, copy] of COPY_POR_TOKEN) {
      if (error.message === token) return { ok: false, error: copy };
    }
  }
  // NUNCA un texto crudo de Postgres. `mapDbError` devuelve el `hint` en los
  // P0001 del proyecto y un mensaje de negocio en todo lo demás; `42501` y
  // `PGRST301` caen en `No tienes permiso para esta operación.`, que es el copy
  // que el contrato pide para el caso sin permiso.
  return { ok: false, error: mapDbError(error) };
}

/**
 * El guard, en la forma que permite escribirlo como PRIMERA línea de cada action.
 *
 * Devuelve el contexto, o el `ResultadoAccion` de rechazo. Cualquier error que no
 * sea `NoAutorizado` SE RELANZA: un servicio de autenticación caído no es «no
 * tienes permiso», y disfrazarlo mandaría al admin a pedir permisos que ya tiene.
 */
async function guard(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof exigirAdmin>>['supabase'] }
  | { ok: false; error: string }
> {
  try {
    const { supabase } = await exigirAdmin();
    return { ok: true, supabase };
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }
}

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
 * FIN-03. Deja constancia de que el pago ya se hizo: fecha de hoy y autor.
 *
 * ── EL MENSAJE DE ÉXITO SE COMPONE CON LO QUE DEVUELVE LA BASE ────────────
 *
 * `Registrado. {Nombre}, {$monto}.` con el nombre y el total que devuelve el
 * RPC, que salen del SNAPSHOT. Componerlo con lo que mandó el cliente dejaría
 * que el propio formulario dictara qué dice el recibo de la operación, y este
 * aviso es lo último que el admin lee antes de hacer la transferencia.
 *
 * ── MARCAR DOS VECES LO BLOQUEA LA BASE, NO LA PANTALLA ───────────────────
 *
 * La interfaz esconde el botón cuando el pago ya está marcado, pero esconder no
 * es impedir: con dos pestañas abiertas el admin puede confirmar dos veces
 * (T-07-59). El RPC bloquea la fila ANTES de leer su estado y RECHAZA con
 * `pago_ya_marcado`. Un `update … where pagado_at is null` evitaría el pisado
 * pero devolvería cero filas, que la pantalla leería como éxito vacío.
 */
export async function marcarPagado(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  // ── 1. GUARD, ANTES QUE NADA ──────────────────────────────────────────────
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  // ── 2. VALIDACIÓN, ANTES DE TOCAR LA BASE ────────────────────────────────
  const parseado = esquemaPago.safeParse(campos(formData, ['pago_id']));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  // ── 3. Y SOLO ENTONCES, LA ESCRITURA ─────────────────────────────────────
  const { data, error } = await ctx.supabase.rpc('marcar_pago_pagado', {
    p_payout: parseado.data.pago_id,
  });
  if (error) return fallo(error);

  const marcado = data?.[0];
  if (!marcado) {
    // El RPC devuelve SIEMPRE una fila o levanta excepción. Cero filas sin error
    // solo puede ser un cambio de forma de la función, y decir «registrado»
    // sobre eso sería exactamente el defecto que este archivo existe para no
    // repetir: el admin transferiría creyendo que ya quedó constancia.
    return {
      ok: false,
      error: 'No se pudo confirmar el registro del pago. Recarga la página y revísalo.',
    };
  }

  return {
    ok: true,
    mensaje: `Registrado. ${marcado.aseador_nombre}, ${formatCOP(marcado.monto_total)}.`,
  };
}

/**
 * FIN-03, camino de REINTENTO. Calcula el pago del periodo que el job no cerró.
 *
 * No es el camino primario: el cierre lo dispara `cerrar_periodo_si_toca()` a las
 * 23:30 de Bogotá del último día hábil. Esto existe porque si ese job falla
 * NADIE COBRA y el admin no tendría ninguna forma de recuperarse desde la
 * interfaz.
 *
 * ── CERRAR ANTES DE TIEMPO LO IMPIDE LA BASE ─────────────────────────────
 *
 * El RPC valida que el rango sea un periodo de cierre real y que su día de
 * cierre haya pasado ESTRICTAMENTE (T-07-61). Cerrar por adelantado pagaría
 * trabajo que aún no ocurrió, y como un periodo cerrado no se recalcula nunca
 * (D7-3), el error quedaría congelado para siempre.
 *
 * La interfaz añade su propia contención: el botón solo existe cuando
 * `periodo_pendiente_de_cierre()` devuelve una fila. Un botón de «cerrar el mes»
 * siempre visible invita a cerrar antes de tiempo.
 */
export async function cerrarPeriodo(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const ctx = await guard();
  if (!ctx.ok) return ctx;

  const parseado = esquemaPeriodo.safeParse(campos(formData, ['desde', 'hasta']));
  if (!parseado.success) return { ok: false, error: MENSAJE_DATOS_INVALIDOS };

  const { error } = await ctx.supabase.rpc('cerrar_periodo', {
    p_desde: parseado.data.desde,
    p_hasta: parseado.data.hasta,
  });
  if (error) return fallo(error);

  return { ok: true, mensaje: 'El periodo quedó cerrado.' };
}
