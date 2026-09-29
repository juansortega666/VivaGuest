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

/** Los dos umbrales de la abreviatura. Van con nombre para que el `if` se lea. */
const MIL = 1_000;
const MILLON = 1_000_000;

/**
 * Igual que `COP` pero con UN decimal. Es lo que emite la coma de es-CO en
 * `$ 1,5M`, y la razon de que exista un formateador y no una concatenacion es la
 * misma que ya tiene escrita `aEnteroCOP`: **el separador decimal de es-CO es la
 * COMA**, y componer `${mantisa.toFixed(1)}M` a mano emitiria `1.5M` con punto, o
 * sea la forma anglosajona, que en es-CO se lee como separador de MILES. Un gasto
 * de un millon y medio se leeria como quince millones.
 */
const COP_UN_DECIMAL = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * PESOS ABREVIADOS PARA LA METRICA DE GASTOS DEL VISTAZO DE `/operacion`
 * (plan 10-05): `180000` produce `"$ 180K"` y `1500000` produce `"$ 1,5M"`.
 *
 * ── LOS TRES TRAMOS ────────────────────────────────────────────────────────
 *
 *   por debajo de mil        -> sin sufijo, la cifra entera  (`$ 999`)
 *   de mil a menos de millon -> sufijo `K`                   (`$ 180K`)
 *   de un millon para arriba -> sufijo `M`                   (`$ 1,5M`)
 *
 * Con mantisa menor que diez se emite UN decimal, porque `$ 1M` y `$ 1,9M` son
 * cifras muy distintas y redondear a la unidad ahi pierde casi la mitad del dato.
 * Con mantisa de dos o tres cifras, ninguno: el decimal de `$ 180,4K` no cambia
 * ninguna decision.
 *
 * ── LA PROMOCION DE UNIDAD, QUE NO ES UN ADORNO ────────────────────────────
 *
 * `999999` cae en el tramo de los miles y su mantisa es `999,999`, que redondeada
 * a su propia precision da MIL. `$ 1.000K` es la cifra correcta escrita en la
 * unidad equivocada, y ademas mete un separador de miles dentro de una
 * abreviatura de miles. Cuando eso pasa se sube de unidad: `$ 1,0M`.
 *
 * ── LA CONSECUENCIA HONESTA DE ABREVIAR, Y COMO SE PAGA ────────────────────
 *
 * **La cifra redondeada NO RECONCILIA con la suma de los gastos del detalle.** Un
 * vistazo que diga `$ 180K` sobre cuatro gastos que suman `$ 180.400` es correcto
 * y va a parecer un error de cuadre a quien abra el detalle. Por eso **la cifra
 * exacta viaja en el `title`**, que es la regla que este repo ya aplica a todo
 * texto truncado: lo que se recorta para caber tiene que estar entero a un
 * `hover` de distancia.
 *
 * La ausencia devuelve lo mismo que `formatCOP`, o sea el em dash, y NO una cadena
 * vacia: un hueco sin glifo en una fila de cuatro metricas se lee como que la
 * metrica no existe.
 */
export function formatAbreviadoCOP(n: number | null | undefined): string {
  if (n == null) return VACIO;

  const absoluto = Math.abs(n);
  if (absoluto < MIL) return COP.format(n);

  let divisor = absoluto < MILLON ? MIL : MILLON;
  let sufijo = divisor === MIL ? 'K' : 'M';

  // Ver la promocion de unidad, arriba.
  if (divisor === MIL && Math.abs(redondearMantisa(n / MIL)) >= MIL) {
    divisor = MILLON;
    sufijo = 'M';
  }

  const mantisa = n / divisor;
  const formateador = Math.abs(mantisa) < 10 ? COP_UN_DECIMAL : COP;

  return `${formateador.format(mantisa)}${sufijo}`;
}

/** Redondea la mantisa a la precision con la que se va a emitir, ni mas ni menos. */
function redondearMantisa(mantisa: number): number {
  return Math.abs(mantisa) < 10 ? Math.round(mantisa * 10) / 10 : Math.round(mantisa);
}
