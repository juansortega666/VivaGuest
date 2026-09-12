import { z } from 'zod';

/**
 * El esquema del reporte del aseador: daño, gasto o faltante.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MÓDULO PURO. Solo `zod`.
 *
 * ── LA SIMPLIFICACIÓN DE D-07 ───────────────────────────────────────────────
 *
 * Un solo formulario con TRES categorías, en vez de tres formularios distintos.
 * El aseador escribe qué pasó y elige a cuál pertenece.
 *
 * La unión es **discriminada por `categoria`**, y eso no es estilo: es lo que
 * hace que un gasto sin monto **no compile**. Un objeto suelto con `monto`
 * opcional dejaría pasar el caso que la Fase 7 no puede sumar.
 * ════════════════════════════════════════════════════════════════════════════
 */

const TEXTO_REQUERIDO = 'Escribe qué pasó.';
const MONTO_REQUERIDO = 'Escribe cuánto costó.';

const descripcion = z.string().trim().min(1, TEXTO_REQUERIDO);

/**
 * El monto, y la razón completa porque es la que se olvida.
 *
 * Va en la **UNIDAD MÍNIMA** de la moneda, como entero positivo. Es la regla 1
 * del camino a v2 de `PROJECT.md` §Constraints:
 *
 *   · El `bigint` de pesos enteros sirve para COP, CLP y PYG, que no tienen
 *     subunidad.
 *   · **No sirve para MXN, BRL, ARS ni PEN**, que tienen centavos, y el objetivo
 *     declarado del producto es venderlo en LATAM.
 *
 * Esta fase es donde entra **el primer campo de dinero que escribe un usuario
 * final**, así que es el momento barato de hacerlo bien: ahora es una columna,
 * y después de la Fase 7 sería una migración con histórico financiero vivo.
 *
 * En pantalla la aseadora ve pesos normales; la unidad mínima es cosa del
 * sistema.
 */
const monto = z
  .number({ message: MONTO_REQUERIDO })
  .int('El monto no lleva decimales: va en la unidad mínima de la moneda.')
  .positive(MONTO_REQUERIDO);

/** Código ISO de tres letras en mayúsculas. Espeja el CHECK de la tabla. */
const moneda = z
  .string()
  .regex(/^[A-Z]{3}$/, 'La moneda va en tres letras mayúsculas.')
  .default('COP');

export const esquemaReporte = z.discriminatedUnion('categoria', [
  z.object({
    categoria: z.literal('dano'),
    descripcion,
  }),
  z.object({
    categoria: z.literal('gasto'),
    descripcion,
    monto,
    moneda,
  }),
  z.object({
    categoria: z.literal('faltante'),
    items: z
      .array(z.string().trim().min(1, TEXTO_REQUERIDO))
      .min(1, 'Escribe qué faltaba antes de enviar el reporte.'),
  }),
]);

export type Reporte = z.infer<typeof esquemaReporte>;
export type CategoriaDeReporte = Reporte['categoria'];

/**
 * Las etiquetas de la interfaz, literales de `06-UI-SPEC.md` §14.1.
 *
 * **No se usan las palabras `daño`, `gasto` ni `faltante` como etiqueta**: son
 * jerga de base de datos, y §14 del contrato prohíbe la jerga en cualquier
 * texto que vea un aseador. Se usan frases de campo.
 */
export const ETIQUETAS_CATEGORIA: Record<CategoriaDeReporte, string> = {
  dano: 'Se dañó algo',
  gasto: 'Tuve que comprar algo',
  faltante: 'Faltaba algo',
};

/** Orden de presentación. */
export const CATEGORIAS: readonly CategoriaDeReporte[] = ['dano', 'gasto', 'faltante'] as const;

/** Solo el daño y el gasto llevan foto; el daño la exige. */
export function exigeFoto(categoria: CategoriaDeReporte): boolean {
  return categoria === 'dano';
}
