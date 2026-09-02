/**
 * Sección 5 del formulario de apartamento (UI-SPEC §8.1): la lista de cuartos y
 * la lista base de faltantes propia del apartamento. APTO-06 y APTO-07.
 *
 * ── POR QUE ESTOS DOS ARRAYS TIENEN SU PROPIO ESQUEMA ───────────────────────
 * Un cuarto NO es un dato decorativo: de la lista de cuartos sale el checklist
 * que el aseador ejecuta en la Fase 6 (CHECK-01), con máximo 3 tareas por tipo
 * según `checklist_tasks`. Y `property_rooms.id` va a estar referenciado por
 * esos checklists, así que la identidad de cada fila importa. Ver la nota de
 * `guardarCuartosYFaltantes` en `app/(admin)/apartamentos/_actions.ts`.
 *
 * ── LA UI ES MAS ESTRICTA QUE LA BASE, A PROPOSITO ──────────────────────────
 * `property_rooms_etiqueta_uniq` es `unique (property_id, etiqueta)` SIN
 * `lower()`, así que la base dejaría convivir `Baño` y `baño` en el mismo
 * apartamento. Aquí se comparan las etiquetas en minúsculas y con `trim`,
 * porque dos cuartos que solo difieren en mayúsculas son un error de tipeo y no
 * dos cuartos: el aseador vería dos entradas indistinguibles en su checklist.
 * Es la misma clase de divergencia deliberada que `apartamento.schema.ts`
 * declara para las puertas de activación, y nadie debe "corregirla" alineando
 * la UI con el índice.
 *
 * Para los faltantes NO hay divergencia: `mic_prop_uniq` es un índice parcial
 * sobre `(property_id, lower(nombre))`, así que comparar en minúsculas es
 * exactamente lo que hace la base.
 *
 * ── LOS DOS ACEPTAN ARRAY VACIO ─────────────────────────────────────────────
 * Un apartamento se puede guardar Y ACTIVAR sin cuartos. Ningún CHECK de
 * `properties` los exige y ningún REQ lo pide, así que los cuartos NO son una
 * puerta de activación y no aparecen en `faltantesParaActivar`. Lo que un
 * apartamento sin cuartos no puede es armar checklist, y de eso avisa el estado
 * vacío de UI-SPEC §9.2 con su segunda frase.
 */
import { z } from 'zod';

import { esquemaActivar, esquemaBorrador } from './apartamento.schema';

/**
 * Topes de longitud de los dos arrays y de los dos textos (T-02-68).
 *
 * Un `useFieldArray` sin tope deja mandar un payload arbitrariamente grande a
 * PostgREST desde un endpoint que solo pide ser admin. Los números no son
 * mágicos: la unidad más grande del catálogo sembrado tiene 6 cuartos, y el
 * catálogo global de faltantes ronda la decena. Cien y doscientos dejan
 * muchísimo aire y siguen siendo un tope.
 */
const MAX_CUARTOS = 100;
const MAX_FALTANTES = 200;
const MAX_ETIQUETA = 80;
const MAX_NOMBRE = 120;

/**
 * Mensajes de duplicado. Son LOS MISMOS que `mapDbError` devuelve para
 * `property_rooms_etiqueta_uniq` y `mic_prop_uniq` (ver `lib/domain/errors.ts`),
 * y esa coincidencia es deliberada: el admin tiene que leer el mismo texto
 * venga el bloqueo del cliente o del 23505. Si divergen, el mismo problema se
 * cuenta de dos formas distintas según por dónde llegue.
 */
export const MSG_CUARTO_DUPLICADO = 'Ya existe un cuarto con esa etiqueta en este apartamento.';
export const MSG_FALTANTE_DUPLICADO = 'Ya existe un faltante con ese nombre.';

/** Una fila del editor de cuartos. Sin `id` es una fila nueva. */
const cuarto = z.object({
  id: z.uuid().optional(),
  room_type_id: z.uuid('Elige un tipo de cuarto'),
  etiqueta: z
    .string()
    .trim()
    .min(1, 'La etiqueta del cuarto es obligatoria')
    .max(MAX_ETIQUETA, `La etiqueta no puede pasar de ${MAX_ETIQUETA} caracteres`),
  sort_order: z.number().int().nonnegative(),
});

/** Una fila del editor de faltantes propios del apartamento. */
const faltante = z.object({
  id: z.uuid().optional(),
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre del faltante es obligatorio')
    .max(MAX_NOMBRE, `El nombre no puede pasar de ${MAX_NOMBRE} caracteres`),
  sort_order: z.number().int().nonnegative(),
});

export type CuartoInput = z.input<typeof cuarto>;
export type CuartoOutput = z.output<typeof cuarto>;
export type FaltanteInput = z.input<typeof faltante>;
export type FaltanteOutput = z.output<typeof faltante>;

/** La clave con la que se comparan dos etiquetas o dos nombres. */
export function claveDeTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLocaleLowerCase('es-CO') : '';
}

/**
 * Emite el issue del duplicado EN EL INDICE DEL ELEMENTO REPETIDO, nunca en la
 * raíz del array.
 *
 * La diferencia no es cosmética: con `path: [i, campo]`, react-hook-form crea el
 * error en `cuartos.<i>.etiqueta` y `FieldError` lo pinta bajo la fila culpable.
 * Con el issue en la raíz, el admin ve un mensaje suelto encima de una lista de
 * ocho filas y tiene que adivinar cuál sobra.
 *
 * Se marca SIEMPRE la SEGUNDA aparición y no la primera: la primera es el cuarto
 * que ya estaba, la segunda es la que el admin acaba de escribir, y es la que
 * tiene que arreglar.
 */
function marcarDuplicados<T>(
  filas: readonly T[],
  campo: 'etiqueta' | 'nombre',
  leer: (fila: T) => unknown,
  mensaje: string,
  ctx: z.RefinementCtx,
): void {
  const vistas = new Set<string>();

  filas.forEach((fila, indice) => {
    const clave = claveDeTexto(leer(fila));
    // Una fila todavía vacía no es un duplicado de otra fila vacía: de eso ya se
    // queja `min(1)` en cada una por separado, y marcarlas además como
    // duplicadas daría dos errores para un solo problema.
    if (clave.length === 0) return;

    if (vistas.has(clave)) {
      ctx.addIssue({ code: 'custom', path: [indice, campo], message: mensaje });
      return;
    }
    vistas.add(clave);
  });
}

/**
 * APTO-06. Acepta el array vacío; rechaza etiquetas repetidas comparando en
 * minúsculas y con `trim`.
 */
export const esquemaCuartos = z
  .array(cuarto)
  .max(MAX_CUARTOS, `No se pueden definir más de ${MAX_CUARTOS} cuartos`)
  .superRefine((filas, ctx) => {
    marcarDuplicados(filas, 'etiqueta', (f) => f.etiqueta, MSG_CUARTO_DUPLICADO, ctx);
  });

/**
 * APTO-07. Solo los faltantes PROPIOS del apartamento: los globales
 * (`property_id is null`) son la biblioteca compartida y no se editan desde el
 * formulario de un apartamento.
 */
export const esquemaFaltantes = z
  .array(faltante)
  .max(MAX_FALTANTES, `No se pueden definir más de ${MAX_FALTANTES} faltantes`)
  .superRefine((filas, ctx) => {
    marcarDuplicados(filas, 'nombre', (f) => f.nombre, MSG_FALTANTE_DUPLICADO, ctx);
  });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOS DOS ESQUEMAS QUE EL FORMULARIO USA DE VERDAD
 *
 * `esquemaBorrador` y `esquemaActivar` validan los 12 campos de `properties` y
 * NADA MAS. Un `z.object` descarta las claves que no conoce, así que si el
 * formulario siguiera resolviendo con ellos, los dos arrays pasarían sin mirar:
 * el duplicado no se bloquearía en el submit y el 23505 llegaría a pantalla,
 * que es exactamente lo que UI-SPEC §8.1 sección 5 manda impedir.
 *
 * Se componen AQUI y no en el componente por la razón mecánica de siempre en
 * este repo: `vitest.config.ts` recoge solo `lib/**`, así que una composición
 * declarada dentro de un `.tsx` no la ejecuta ninguna suite. Y el fallo que
 * esconde —extender uno de los dos y olvidar el otro— es invisible para `tsc`.
 * Los tests de este módulo comprueban los dos, y comprueban además que los
 * refinamientos heredados de `apartamento.schema.ts` siguen vivos tras el
 * `.extend()`.
 * ════════════════════════════════════════════════════════════════════════════
 */
const colecciones = { cuartos: esquemaCuartos, faltantes: esquemaFaltantes };

/** `Guardar`: invariantes de siempre, más los dos arrays. */
export const esquemaFormularioBorrador = esquemaBorrador.extend(colecciones);

/** `Guardar y activar`: lo anterior, más las puertas de activación de §8.2. */
export const esquemaFormularioActivar = esquemaActivar.extend(colecciones);

/** Los valores del formulario completo, tal como los entrega la pantalla. */
export type FormularioInput = z.input<typeof esquemaFormularioBorrador>;
