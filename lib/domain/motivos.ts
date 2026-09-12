import type { Enums } from '@/lib/database.types';

/**
 * Las dos listas cerradas de motivos, con sus etiquetas en español.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MÓDULO PURO. Devuelve etiquetas, no componentes.
 *
 * ── POR QUÉ LAS CLAVES SE DERIVAN DEL ENUM GENERADO Y NO SE ESCRIBEN A MANO ──
 *
 * `ETIQUETAS_SKIP` es un `Record<MotivoSkip, string>` sobre el enum que la
 * migración 18 creó. Eso significa que el día que la migración añada un quinto
 * motivo, **`tsc` exige la etiqueta nueva aquí mismo**. Escrito a mano, ese
 * motivo renderizaría una cadena vacía en la pantalla de la aseadora y nadie se
 * enteraría hasta que alguien lo viera en producción.
 *
 * ── POR QUÉ SON DOS FUENTES DISTINTAS, Y ES A PROPÓSITO ─────────────────────
 *
 * El motivo del SKIP es un enum de la base, porque **el admin lo va a contar**:
 * necesita saber cuántas veces pasa cada cosa para decidir si la lista está mal
 * hecha (deuda declarada §16.6 del contrato de UI).
 *
 * El motivo del NO PUEDO no tiene enum: `decline_cleaning` recibe texto libre
 * desde la Fase 1 y no se toca. Su unión se declara aquí, y por eso esta es la
 * que puede divergir de la base. Queda anotado.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Derivado del enum de la migración 18. NO se escribe a mano. */
export type MotivoSkip = Enums<'motivo_sin_evidencia'>;

/**
 * Las etiquetas del skip, literales de `06-UI-SPEC.md` §8.4.
 *
 * `Record` y no un objeto suelto: falta una clave y `tsc` rompe aquí.
 */
export const ETIQUETAS_SKIP: Record<MotivoSkip, string> = {
  huesped_dejo_cosas: 'El huésped dejó cosas adentro',
  cuarto_cerrado: 'El cuarto estaba cerrado',
  sin_luz: 'No había luz',
  otro: 'Otro',
};

/** Orden de presentación del grupo de opciones. `otro` va último, siempre. */
export const MOTIVOS_SKIP: readonly MotivoSkip[] = [
  'huesped_dejo_cosas',
  'cuarto_cerrado',
  'sin_luz',
  'otro',
] as const;

/** Los del `no puedo`, de `06-UI-SPEC.md` §6.1. Sin enum en la base. */
export type MotivoNoPuedo = 'enfermo' | 'no_alcanzo' | 'apto_no_disponible' | 'otro';

export const ETIQUETAS_NO_PUEDO: Record<MotivoNoPuedo, string> = {
  enfermo: 'Estoy enferma o enfermo',
  no_alcanzo: 'No alcanzo a llegar',
  apto_no_disponible: 'El apartamento no está disponible',
  otro: 'Otro',
};

export const MOTIVOS_NO_PUEDO: readonly MotivoNoPuedo[] = [
  'enfermo',
  'no_alcanzo',
  'apto_no_disponible',
  'otro',
] as const;

/**
 * Solo `otro` exige explicación.
 *
 * ── LO QUE SE DESCARTÓ, Y CONVIENE QUE SE LEA COMO DECISIÓN ─────────────────
 *
 * Se propuso exigir una justificación libre de **mínimo 30 palabras** para
 * cualquier skip. Se descartó, y la razón es de comportamiento humano y no de
 * esquema: un contador de palabras **se burla solo** (la gente escribe relleno
 * para pasar el contador) y **castiga a quien tiene una razón legítima pero
 * corta**, como "el cuarto estaba cerrado".
 *
 * Una lista cerrada, además, se puede contar. Un texto libre no.
 *
 * El campo libre sigue existiendo, opcional, y solo es obligatorio con `otro`,
 * que es exactamente el caso en que la lista no dice nada útil. El `CHECK`
 * `crs_otro_exige_nota` de la migración 18 lo impone también en la base, así
 * que esta función es cortesía de pantalla y no el control.
 */
export function exigeNota(motivo: MotivoSkip | MotivoNoPuedo): boolean {
  return motivo === 'otro';
}
