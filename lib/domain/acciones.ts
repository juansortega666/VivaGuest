/**
 * Contrato de retorno de TODAS las Server Actions de la fase.
 *
 * Se declara una sola vez y aqui, en `lib/domain/`, y no en cada archivo de
 * actions: es lo que permite que `useActionState` tenga siempre la misma forma de
 * estado y que la UI decida donde va el error sin conocer la action.
 *
 * La regla de `campo` viene de 02-UI-SPEC.md §9.4:
 *   - con `campo`  -> el error se pinta INLINE bajo ese campo del formulario.
 *   - sin `campo`  -> el error va a un toast y el formulario CONSERVA todo lo
 *     escrito. Perder lo tecleado por un error de servidor es la forma mas rapida
 *     de que alguien deje de usar la herramienta.
 *
 * Un error de base que no tiene un input al que apuntar no debe inventarse uno:
 * `campoDeConstraint()` de `lib/domain/errors.ts` devuelve `undefined` justo para
 * eso, y entonces va a toast, que es lo correcto.
 */
export type ResultadoAccion =
  | { ok: true; mensaje: string }
  | { ok: false; error: string; campo?: string };
