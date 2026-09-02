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

/**
 * Separador de miles SIN simbolo de moneda, para el INPUT de dinero de §8.4.
 *
 * `formatCOP` no sirve dentro de un input: meteria `"$ "` en el `value`, y
 * entonces el admin tendria que borrar el simbolo cada vez que corrige la cifra.
 * El adorno `$` va FUERA del input, en el `InputGroupAddon`, y este helper
 * produce solo los digitos agrupados.
 */
const MILES = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * `120000` produce `"120.000"`. Ausencia produce `""` y NO em dash: un em dash
 * dentro de un input es un caracter que el usuario tiene que borrar a mano.
 *
 * Acepta tambien el string ya tecleado, para poder formatear al `blur` sin
 * convertir dos veces desde fuera.
 */
export function formatMilesCOP(v: number | string | null | undefined): string {
  const entero = aEnteroCOP(v);
  if (entero == null) return '';
  return MILES.format(entero);
}

/**
 * EL INVERSO EXACTO DE `formatMilesCOP`, Y LA PIEZA QUE IMPIDE GUARDAR 120 PESOS
 * DONDE EL ADMIN ESCRIBIO 120.000.
 *
 * El input muestra `"120.000"` con separador de miles (UI-SPEC §8.4) y
 * `apartamento.schema.ts` valida con `z.coerce.number()`, que por debajo es
 * `Number(...)`. Y `Number('120.000')` es **120**, porque JavaScript lee ese
 * punto como separador DECIMAL. Sin esta funcion entre el DOM y el estado del
 * formulario, la tarifa se guarda dividida por mil y NADA se queja: 120 es un
 * entero valido, no negativo, y pasa los tres CHECK de `properties`.
 *
 * Por eso se usa como `setValueAs` del `register()` de react-hook-form: la
 * transformacion ocurre al LEER del DOM, asi que el estado del formulario —y con
 * el `faltantesParaActivar`, la validacion y el payload— siempre ve un entero.
 *
 * Devuelve `null` cuando no queda ningun digito, que es lo que
 * `apartamento.schema.ts` entiende por "campo vacio" y lo que hace que el
 * checklist de activacion diga que falta.
 */
export function aEnteroCOP(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v !== 'string') return null;

  // Se conservan SOLO los digitos: caen el `$`, los espacios (incluido el NBSP
  // estrecho U+202F que mete `Intl` en es-CO), los puntos, las comas y el signo
  // menos. El menos se pierde a proposito: `props_rates_nonneg` prohibe
  // negativos y el campo los rechaza al teclear, asi que un `-` solo puede
  // llegar de un pegado, y ahi 120000 es mejor respuesta que un NaN silencioso.
  const digitos = v.replace(/\D/g, '');
  if (digitos.length === 0) return null;

  const entero = Number(digitos);
  return Number.isSafeInteger(entero) ? entero : null;
}
