/**
 * Formato de dinero. UNICO sitio donde se construye un `Intl.NumberFormat` de COP
 * (UI-SPEC §8.4).
 *
 * La base guarda `bigint` de pesos enteros: un decimal en pantalla es un dato que no
 * existe. De ahi que `minimumFractionDigits` y `maximumFractionDigits` sean 0 y no un
 * default.
 */

/**
 * Se construye UNA vez a nivel de modulo. Instanciar `Intl.NumberFormat` es caro y la
 * tabla de apartamentos lo llama decenas de veces por render (39 filas x 2 columnas de
 * dinero).
 */
const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Valor ausente. Em dash, como manda UI-SPEC §8.4. */
const VACIO = '—';

/**
 * Formatea pesos colombianos enteros: `120000` produce `"$ 120.000"`.
 *
 * `null` y `undefined` producen em dash. El `0` NO es ausencia: se formatea como `"$ 0"`,
 * porque un pago de cero es una configuracion y un campo sin llenar es otra cosa.
 *
 * Quien lo renderiza debe acompanar el em dash de un `<span class="sr-only">sin
 * definir</span>`: el guion solo no dice nada en un lector de pantalla.
 */
export function formatCOP(n: number | null | undefined): string {
  if (n == null) return VACIO;
  return COP.format(n);
}
