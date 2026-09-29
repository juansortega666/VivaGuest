/**
 * UNA MÉTRICA DEL VISTAZO DE `/operacion` (D-05-6 del plan 10-05).
 *
 * Rótulo en micro versalitas, cifra en display, leyenda opcional en micro, y un
 * `title` opcional para lo que no cabe.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SIN BORDE, SIN FONDO Y SIN SOMBRA. NO ES UN OLVIDO Y NO SE "ARREGLA".
 *
 * Es el principio de DATA INK que el dueño enunció el 2026-09-28 con estas
 * palabras: cada píxel muestra información nueva, y ni bordes ni sombras ni
 * decoración que no comunique nada.
 *
 * **Y esto separa esta pantalla de `/finanzas` a propósito.** `TarjetaKPI` de la
 * Fase 7 es `rounded-md border border-border bg-background p-lg` con alto fijo
 * `h-kpi`, y su propia cabecera dice que lo que hace destacar al número es
 * justamente su card. Acá la regla es la contraria. Las dos pantallas van a verse
 * distintas, y es declarado: **`TarjetaKPI` no se reutiliza y no se dobla**, entre
 * otras cosas porque formatea dinero por dentro y tres de estas cuatro métricas no
 * son dinero.
 *
 * Lo que hace destacar al número acá es el aire y el salto de tamaño entre el
 * rótulo (12px) y la cifra (24px), no una caja alrededor.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL COLOR ES ESTADO, NUNCA DECORACIÓN ──────────────────────────────────
 *
 * **LAS CUATRO CIFRAS VAN EN `--foreground`, LAS CUATRO, SIEMPRE.** Y esa decisión
 * merece su párrafo, porque la tentación contraria es razonable: un `Sin confirmar`
 * en tres y un `Urgentes` en dos SON estados que piden acción, así que pintarlos en
 * `--status-warn` parecería justo lo que el dueño autorizó al reservar el color al
 * estado.
 *
 * No se hace, por dos razones:
 *
 *   1. **Serían dos de cuatro cifras en ámbar casi todos los días.** Un vistazo con
 *      la mitad de sus números en color de aviso deja de tener color de aviso: el ojo
 *      se acostumbra en dos días y el día que importe no lo va a ver. Es el mismo
 *      argumento que ya está escrito para `Atrasados · 0 aseos` y para la escala de
 *      color por carga de `FranjaCarga`.
 *   2. **Acá el color no aporta un canal que no esté.** La cifra ya dice cuántos
 *      hay, y el rótulo ya dice de qué. Donde el color sí aporta es en la TARJETA de
 *      un aseo concreto, que es donde hay que distinguir uno entre treinta de un
 *      vistazo, y ahí lo lleva el estado del dominio.
 *
 * Si el dueño lo pide al ver la pantalla, es una clase por métrica y va en la lista
 * del checkpoint. Lo que no se hace es adelantarlo sin que lo haya pedido.
 */
export function MetricaDelDia({
  clave,
  rotulo,
  cifra,
  textoAccesible,
  leyenda,
  title,
}: {
  /**
   * La clave estable de la métrica. Va al DOM como `data-metrica` y es lo que
   * localiza la aserción: el rótulo visible es COPIA y una aserción colgada de la
   * copia se rompe el día que alguien reescribe una palabra.
   */
  clave: string;
  rotulo: string;
  /** Lo que se pinta. Puede ser el glifo de dato ausente, y entonces va `textoAccesible`. */
  cifra: string;
  /**
   * Lo que oye quien no ve la cifra. Solo hace falta cuando la cifra es un glifo:
   * un guion suelto no dice nada en un lector de pantalla, que es la misma regla
   * que `SinDato` de la fila de aseo y que el em dash de `formatCOP`.
   */
  textoAccesible?: string;
  leyenda?: string;
  title?: string;
}) {
  return (
    <div data-slot="metrica-dia" data-metrica={clave} title={title} className="flex flex-col gap-xs">
      <span className="text-micro font-semibold tracking-columna text-muted-foreground uppercase">
        {rotulo}
      </span>

      {/*
        `tabular-nums` (§3): las cuatro cifras se repintan al navegar de día y sin
        numerales tabulares el ancho baila y arrastra lo que tiene al lado.
      */}
      <span
        // `data-cifra` y no un `data-slot` nuevo: es el gancho del localizador de
        // la aserción, y hace falta porque `toContainText('2')` sobre la métrica
        // entera se daría por satisfecho con un `12` de la leyenda. Va acá y no en
        // el contenedor para que la aserción mida LA CIFRA y no el rótulo.
        data-cifra="true"
        className="text-display tabular-nums text-foreground"
      >
        {/*
          Con `textoAccesible` el glifo se OCULTA al lector y el motivo lo sustituye,
          exactamente como hace `SinDato` de la fila de aseo: un guion suelto leído en
          voz alta no dice nada, y leído JUNTO a "no aplica" dice dos veces lo mismo.
        */}
        {textoAccesible === undefined ? (
          cifra
        ) : (
          <>
            <span aria-hidden="true">{cifra}</span>
            <span className="sr-only">{textoAccesible}</span>
          </>
        )}
      </span>

      {/*
        La leyenda solo se renderiza cuando hay algo que decir. Un `+0 en otros
        días` es una línea de texto que dice que no hay nada que decir, que es la
        misma regla que ya aplica la cabecera de día para su `sin confirmar`.
      */}
      {leyenda !== undefined && <span className="text-micro text-muted-foreground">{leyenda}</span>}
    </div>
  );
}
