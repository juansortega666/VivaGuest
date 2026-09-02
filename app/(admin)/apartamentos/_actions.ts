'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import {
  esquemaActivar,
  esquemaBorrador,
  type ApartamentoInput,
  type ApartamentoOutput,
} from '@/lib/domain/apartamento.schema';
import { campoDeConstraint, mapDbError, type DbErrorLike } from '@/lib/domain/errors';
import type { Database, Tables } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Escrituras del catálogo de apartamentos (APTO-01, 02, 04, 05, 08, 09, 10).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL REPARTO DE CLIENTES ES MEDIDO Y NO ES NEGOCIABLE
 *
 * Cada tabla se escribe con el ÚNICO cliente que la base permite. No es una
 * preferencia de estilo: es lo que el modelo de grants deja hacer.
 *
 * ┌────────────────────┬──────────────────────┬───────────────────────────────┐
 * │ Tabla              │ Cliente              │ Evidencia                     │
 * ├────────────────────┼──────────────────────┼───────────────────────────────┤
 * │ properties         │ el del USUARIO, con  │ 02-RESEARCH §8.6: 39 filas    │
 * │                    │ su JWT y RLS         │ leídas y upsert OK con el JWT │
 * │                    │                      │ del admin                     │
 * │ property_secrets   │ el ADMINISTRATIVO,   │ §8.6: `42501 permission       │
 * │                    │ lectura Y escritura  │ denied for table              │
 * │                    │                      │ property_secrets`, en SELECT  │
 * │                    │                      │ y en UPSERT, INCLUSO SIENDO   │
 * │                    │                      │ ADMIN con su propio JWT       │
 * │ calendar_feeds     │ el del USUARIO       │ §8.6: upsert OK. Lo usa el    │
 * │                    │                      │ plan 02-14, no este           │
 * └────────────────────┴──────────────────────┴───────────────────────────────┘
 *
 * AQUÍ ES DONDE ALGUIEN PIERDE UNA HORA, Y POR ESO ESTE PÁRRAFO EXISTE.
 * `supabase/migrations/…_08_rls_policies.sql` declara
 *
 *     create policy secrets_admin_all on public.property_secrets
 *       for all to authenticated using (private.is_admin());
 *
 * y esa policy es INALCANZABLE. La migración 07 nunca otorgó privilegios de
 * tabla sobre `property_secrets` a `authenticated` (`-- Sin ningun grant ->
 * property_secrets, storage_deletion_queue`), y en Postgres el grant se evalúa
 * ANTES que la RLS: sin privilegio de tabla no se llega a mirar ninguna policy.
 * Quien lea las policies y no los grants va a escribir esto con el cliente
 * equivocado y a depurar un `42501` que no viene de la RLS.
 *
 * La ausencia de grant no es un descuido: es la mitigación de T-02-49. Sin
 * grant no hay policy que pueda filtrar el código de la cerradura por error, ni
 * embed de PostgREST que lo alcance. La ruta legítima del aseador es el RPC
 * `reveal_access_code()` de la Fase 1, con ventana temporal y auditoría.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * EL ORDEN DE LAS TRES OPERACIONES DE CADA ACTION ES OBLIGATORIO:
 *
 *   1. `exigirAdmin()`       — un Server Action es un endpoint HTTP PÚBLICO
 *   2. validación con Zod    — la UI aprieta más que la base, a propósito
 *   3. `createAdminClient()` — SOLO entonces, y solo si hace falta
 *
 * Invertir 1 y 3 lo atrapa el guardarraíl 7 de `scripts/ci/check-service-role.sh`,
 * que recorre el archivo función a función. Invertir 2 y 3 no lo atrapa nadie.
 * Que el botón se renderice dentro del route group `(admin)` no autoriza nada:
 * cualquiera con el id de action y un payload invoca esto directamente.
 *
 * ESTA FASE NO CREA NINGUNA FUNCIÓN EN `public`, y este archivo es donde más
 * tentador sería. Un RPC `SECURITY DEFINER` haría atómica la escritura de
 * `properties` + `property_secrets`, que aquí son dos operaciones sin
 * transacción común (ver la nota de `guardarApartamento`). No se hace, y el
 * precio de hacerlo queda escrito: toda función nueva de `public` necesita,
 * PEGADO a su definición,
 *
 *     revoke all     on function public.<f>(<args>) from public, anon;
 *     grant  execute on function public.<f>(<args>) to authenticated;
 *
 * porque en PG 17.6 `alter default privileges` NO puede quitarle `EXECUTE` a
 * PUBLIC (hallazgo 5 de `deferred-items.md`, medido dos veces): una función
 * nueva nace ejecutable por `anon`. Y merecería su propia aserción pgTAP.
 *
 * SOBRE LA CLAVE DE SERVICIO: se lee en `lib/supabase/admin.ts` y en ningún
 * otro sitio. El nombre literal de esa variable de entorno NO se escribe en
 * este archivo, ni siquiera en un comentario: el guardarraíl 1 hace grep de ese
 * token y un comentario que lo cite rompe el build.
 */

/** `Guardar` o `Guardar y activar`: dos niveles de exigencia (UI-SPEC §8.2). */
export type ModoGuardado = 'borrador' | 'activar';

/**
 * La sección 4 del formulario (UI-SPEC §8.1). Va a `property_secrets`, que es
 * otra tabla y otro cliente. Se declara aparte de los 12 campos de
 * `apartamentoBase` para que la frontera se vea en la firma y no haya que
 * recordarla: lo que está aquí dentro es una credencial.
 */
export interface EntradaSecretos {
  tipo_cerradura?: string | null;
  /** El código físico de la cerradura. */
  codigo_acceso?: string | null;
  notas_acceso?: string | null;
}

export interface EntradaApartamento {
  /** Sin `id` se crea; con `id` se actualiza. */
  id?: string;
  modo: ModoGuardado;
  /** Los 12 campos de `apartamentoBase`, tal como los entrega el formulario. */
  campos: ApartamentoInput;
  /** Omitir para no tocar `property_secrets` en absoluto. */
  secretos?: EntradaSecretos;
}

/** Lo que devuelve `leerSecretos`. Cuatro credenciales en un solo objeto. */
export interface SecretosApartamento {
  codigo_acceso: string | null;
  tipo_cerradura: string;
  notas_acceso: string | null;
  ical_url: string | null;
}

/** El espejo en Zod de `property_secrets_tipo_cerradura_valido` (23514). */
const esquemaSecretos = z.object({
  tipo_cerradura: z
    .enum(['inteligente', 'llave_fisica'], { error: 'Tipo de cerradura inválido.' })
    .nullish(),
  codigo_acceso: z.string().nullish(),
  notas_acceso: z.string().nullish(),
});

/**
 * Un id de apartamento. Sin esto, un id malformado llega a Postgres y vuelve
 * como `22P02`, que `mapDbError` solo puede traducir al mensaje genérico.
 */
const esquemaId = z.uuid('Identificador de apartamento inválido.');

/** Cadena vacía o solo espacios ⇒ `null`. Un `''` en la base no es "sin dato". */
function aNuloSiVacio(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

/**
 * Traduce el primer problema de Zod a la forma de `ResultadoAccion`.
 *
 * Con `campo` el formulario lo pinta inline bajo ese input; sin `campo` va a
 * toast (UI-SPEC §9.4). Los `path` de los refinamientos de
 * `apartamento.schema.ts` ya coinciden con las claves del formulario.
 */
function problemaZod(error: z.ZodError): { ok: false; error: string; campo?: string } {
  const problema = error.issues[0];
  return {
    ok: false,
    error: problema.message,
    campo: typeof problema.path[0] === 'string' ? problema.path[0] : undefined,
  };
}

/**
 * TODO error de base sale por aquí. Nunca se renderiza un string crudo de
 * Postgres (UI-SPEC §9.4): vienen en inglés y con el nombre del constraint
 * dentro, que es información de la forma del schema.
 */
function errorDeBase(error: DbErrorLike): { ok: false; error: string; campo?: string } {
  return {
    ok: false,
    error: mapDbError(error),
    campo: campoDeConstraint(error.message),
  };
}

/**
 * 0 filas afectadas sin error de Postgres.
 *
 * Es lo que le pasa a un aseador que invoque esta action: tiene el grant sobre
 * `properties`, así que no hay `42501`, pero `properties_admin_all` no casa y no
 * hay ninguna fila que actualizar. Medido en 02-RESEARCH §7.2. También cubre el
 * id que sencillamente no existe, y los dos casos dan el mismo mensaje a
 * propósito: distinguirlos confirmaría la existencia del apartamento a quien no
 * puede verlo.
 */
function noEncontrado(): { ok: false; error: string } {
  return { ok: false, error: mapDbError({ code: 'PGRST116' }) };
}

/** Los 12 campos validados, en la forma que espera `properties`. */
function filaDeProperties(
  campos: ApartamentoOutput,
): Database['public']['Tables']['properties']['Insert'] {
  // `?? null` y no omitir la clave: si el admin borra la dirección, hay que
  // ESCRIBIR null. Omitiendo el campo, el update lo dejaría como estaba y el
  // borrado no tendría efecto sin que nada lo dijera.
  return {
    nombre: campos.nombre,
    cluster: campos.cluster,
    direccion: campos.direccion ?? null,
    maps_url: campos.maps_url ?? null,
    gestion_vivaguest: campos.gestion_vivaguest,
    tarifa_huesped: campos.tarifa_huesped ?? null,
    pago_aseador: campos.pago_aseador ?? null,
    fee_discriminado: campos.fee_discriminado,
    responsable_id: campos.responsable_id ?? null,
    suplente_id: campos.suplente_id ?? null,
    contacto_externo: campos.contacto_externo ?? null,
    hora_limite: campos.hora_limite,
  };
}

/**
 * Una fila de `properties` en la forma que comen `esquemaBorrador` y
 * `esquemaActivar`, para poder revalidar contra el contrato de UI-SPEC §8.2 lo
 * que ya está guardado.
 */
function valoresDesdeFila(fila: Tables<'properties'>): ApartamentoInput {
  return {
    nombre: fila.nombre,
    cluster: fila.cluster,
    direccion: fila.direccion,
    maps_url: fila.maps_url,
    gestion_vivaguest: fila.gestion_vivaguest,
    tarifa_huesped: fila.tarifa_huesped,
    pago_aseador: fila.pago_aseador,
    fee_discriminado: fila.fee_discriminado,
    responsable_id: fila.responsable_id,
    suplente_id: fila.suplente_id,
    contacto_externo: fila.contacto_externo,
    // `properties.hora_limite` es de tipo `time` y PostgREST la devuelve como
    // 'HH:MM:SS'. `RE_HORA` del esquema exige 'HH:MM' EXACTO, así que pasarla
    // tal cual haría fallar la revalidación de TODOS los apartamentos con un
    // mensaje de formato de hora que no tiene nada que ver con lo que falta.
    hora_limite: fila.hora_limite.slice(0, 5),
  };
}

/**
 * Crea o actualiza un apartamento, en modo borrador o activando (APTO-01).
 *
 * `properties` con el cliente del usuario; `property_secrets`, si vienen, con el
 * administrativo. SON DOS OPERACIONES SIN TRANSACCIÓN COMÚN: si la segunda
 * falla, el apartamento queda guardado y los secretos no. Es deliberado y es el
 * precio de no crear una función en `public` (ver la cabecera). El orden
 * también: `properties` primero porque `property_secrets.property_id` es una FK
 * contra ella, así que al crear no hay a qué colgar los secretos hasta tener el
 * id.
 */
export async function guardarApartamento(
  entrada: EntradaApartamento,
): Promise<ResultadoAccion & { id?: string }> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  let contexto;
  try {
    contexto = await exigirAdmin();
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }
  const { supabase, user } = contexto;

  // ── 2. VALIDACIÓN ───────────────────────────────────────────────────────────
  // El esquema depende del BOTÓN que se pulsó: `is_active` es un modo de submit,
  // no un campo. `esquemaActivar` es más estricto que la base a propósito y esa
  // divergencia está documentada en `apartamento.schema.ts`; en particular, la
  // puerta de `contacto_externo` para unidades informativas NO tiene ningún
  // 23514 detrás. Si esta validación se salta, esa regla desaparece del sistema.
  const esquema = entrada.modo === 'activar' ? esquemaActivar : esquemaBorrador;
  const parseado = esquema.safeParse(entrada.campos);
  if (!parseado.success) return problemaZod(parseado.error);

  const secretos = esquemaSecretos.safeParse(entrada.secretos ?? {});
  if (!secretos.success) return problemaZod(secretos.error);

  // ── 3a. `properties`: CLIENTE DEL USUARIO ───────────────────────────────────
  const fila = filaDeProperties(parseado.data);
  // En modo borrador NO se toca `is_active`: guardar cambios sobre un
  // apartamento ya activo no puede desactivarlo por el camino.
  const conEstado = entrada.modo === 'activar' ? { ...fila, is_active: true } : fila;

  let id = entrada.id;

  if (id) {
    const revisado = esquemaId.safeParse(id);
    if (!revisado.success) return problemaZod(revisado.error);

    const { data, error } = await supabase
      .from('properties')
      .update(conEstado)
      .eq('id', id)
      .select('id');

    if (error) return errorDeBase(error);
    if (!data || data.length === 0) return noEncontrado();
  } else {
    const { data, error } = await supabase
      .from('properties')
      .insert(conEstado)
      .select('id')
      .single();

    if (error) return errorDeBase(error);
    id = data.id;
  }

  // ── 3b. `property_secrets`: CLIENTE ADMINISTRATIVO, LA ÚNICA RUTA ───────────
  if (entrada.secretos) {
    const admin = createAdminClient();

    const { error } = await admin.from('property_secrets').upsert(
      {
        property_id: id,
        tipo_cerradura: secretos.data.tipo_cerradura ?? 'inteligente',
        codigo_acceso: aNuloSiVacio(secretos.data.codigo_acceso),
        notas_acceso: aNuloSiVacio(secretos.data.notas_acceso),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'property_id' },
    );

    if (error) return errorDeBase(error);
  }

  // El payload de arriba OMITE a propósito la columna de la URL de exportación
  // del calendario, que vive en esta misma tabla. PostgREST solo actualiza las
  // columnas presentes en el objeto, así que omitirla la deja intacta. Ponerla
  // en `null` "para completar la fila" borraría en cada guardado la credencial
  // que conecta el plan 02-14, y el síntoma aparecería un día después, en el
  // sync, lejos del formulario que lo causó.

  revalidatePath('/apartamentos');
  revalidatePath(`/apartamentos/${id}`);

  return {
    ok: true,
    mensaje: entrada.modo === 'activar' ? 'Apartamento activado.' : 'Cambios guardados.',
    id,
  };
}

/**
 * Activa un apartamento ya guardado (APTO-02), desde el menú `⋯` de la tabla.
 *
 * REVALIDA CON `esquemaActivar` LA FILA LEÍDA, ANTES DEL UPDATE. Los tres CHECK
 * de activación de `properties` no deben poder dispararse desde la UI, y este
 * camino no pasa por el formulario: el menú de UI-SPEC §7.3 ofrece `Activar`
 * sobre una fila, sin ninguna validación de cliente detrás. Sin esta relectura,
 * la única red sería el 23514, y su mensaje llegaría a un toast sin decir qué
 * campo falta. Peor: para una unidad INFORMATIVA sin contacto externo no hay
 * 23514 ninguno, porque `props_active_requires_owner` está condicionado a
 * `gestion_vivaguest`. Esa puerta existe SOLO aquí y en el formulario.
 *
 * No construye el cliente administrativo, y no es un olvido: `properties` es
 * escribible con el JWT del admin. Saltarse la RLS para escribir lo que el
 * llamador ya puede escribir es privilegio gratis. El guard sigue siendo
 * obligatorio por otra vía y más fuerte que el guardarraíl 7: el cliente con el
 * que se consulta LO DEVUELVE `exigirAdmin()`, así que borrarlo deja la función
 * sin cliente y no compila.
 */
export async function activarApartamento(id: string): Promise<ResultadoAccion> {
  // ── 1. GUARD ────────────────────────────────────────────────────────────────
  let contexto;
  try {
    contexto = await exigirAdmin();
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }
  const { supabase } = contexto;

  // ── 2. VALIDACIÓN ───────────────────────────────────────────────────────────
  const revisado = esquemaId.safeParse(id);
  if (!revisado.success) return problemaZod(revisado.error);

  const { data: fila, error: errorLectura } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (errorLectura) return errorDeBase(errorLectura);
  if (!fila) return noEncontrado();

  const revision = esquemaActivar.safeParse(valoresDesdeFila(fila));
  if (!revision.success) return problemaZod(revision.error);

  // ── 3. UPDATE, CON EL CLIENTE DEL USUARIO ───────────────────────────────────
  const { data, error } = await supabase
    .from('properties')
    .update({ is_active: true })
    .eq('id', id)
    .select('id');

  if (error) return errorDeBase(error);
  if (!data || data.length === 0) return noEncontrado();

  revalidatePath('/apartamentos');
  revalidatePath(`/apartamentos/${id}`);

  return { ok: true, mensaje: 'Apartamento activado.' };
}

/**
 * Desactiva un apartamento (APTO-02).
 *
 * No hay nada que revalidar: los CHECK de `properties` solo se disparan al
 * ACTIVAR (`not (is_active and gestion_vivaguest) or …`), así que bajar
 * `is_active` no puede violar ninguno. Un apartamento incompleto se desactiva
 * sin ruido, que es justamente lo que el admin necesita para sacarlo de
 * circulación mientras lo termina de configurar.
 *
 * No toca `cleanings`: los aseos ya generados siguen existiendo y esta fase no
 * los gestiona. El test de integración lo fija contando antes y después.
 */
export async function desactivarApartamento(id: string): Promise<ResultadoAccion> {
  // ── 1. GUARD ────────────────────────────────────────────────────────────────
  let contexto;
  try {
    contexto = await exigirAdmin();
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, error: e.message };
    throw e;
  }
  const { supabase } = contexto;

  // ── 2. VALIDACIÓN ───────────────────────────────────────────────────────────
  const revisado = esquemaId.safeParse(id);
  if (!revisado.success) return problemaZod(revisado.error);

  // ── 3. UPDATE, CON EL CLIENTE DEL USUARIO ───────────────────────────────────
  const { data, error } = await supabase
    .from('properties')
    .update({ is_active: false })
    .eq('id', id)
    .select('id');

  if (error) return errorDeBase(error);
  if (!data || data.length === 0) return noEncontrado();

  revalidatePath('/apartamentos');
  revalidatePath(`/apartamentos/${id}`);

  return { ok: true, mensaje: 'Apartamento desactivado.' };
}

/**
 * Los secretos de UN apartamento, para rellenar la sección 4 del formulario de
 * edición (UI-SPEC §8.1).
 *
 * ⚠️ ESTE ES UN ENDPOINT HTTP PÚBLICO QUE DEVUELVE EL CÓDIGO DE UNA CERRADURA Y
 * LA URL DE EXPORTACIÓN DEL CALENDARIO. Las dos son credenciales: la primera
 * abre una puerta física, y un GET a la segunda revela la ocupación completa del
 * apartamento sin autenticarse. El guard NO es defensa en profundidad aquí; es
 * lo único que separa esta función de una fuga, porque el cliente
 * administrativo salta la RLS por completo y no hay una segunda capa detrás.
 * Nada de lo que hay en este archivo debe copiarse a otra action sin copiar
 * también la primera línea del cuerpo (T-02-50).
 *
 * Devuelve un apartamento POR LLAMADA, nunca la tabla. Y devuelve `null` tanto
 * si no existe como si el llamador no es admin: distinguirlos convertiría la
 * función en un oráculo de qué ids existen.
 *
 * El valor que devuelve NO se registra en ningún log ni viaja a `last_error`
 * (T-02-51). Esa regla vale también para el plan 02-14.
 */
export async function leerSecretos(id: string): Promise<SecretosApartamento | null> {
  // ── 1. GUARD, ANTES QUE NADA ────────────────────────────────────────────────
  try {
    await exigirAdmin();
  } catch (e) {
    if (e instanceof NoAutorizado) return null;
    throw e;
  }

  // ── 2. VALIDACIÓN ───────────────────────────────────────────────────────────
  const revisado = esquemaId.safeParse(id);
  if (!revisado.success) return null;

  // ── 3. SOLO AHORA, EL CLIENTE ADMINISTRATIVO ────────────────────────────────
  // Con el JWT del admin esta consulta devuelve `42501 permission denied for
  // table property_secrets`. No es la RLS: es que la tabla no tiene grant. No
  // existe otra ruta.
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('property_secrets')
    .select('codigo_acceso, tipo_cerradura, notas_acceso, ical_url')
    .eq('property_id', revisado.data)
    .maybeSingle();

  // El error no se propaga con su mensaje: sería el único sitio del sistema que
  // le cuenta a un no autorizado que esta tabla existe.
  if (error) return null;

  return data ?? null;
}
