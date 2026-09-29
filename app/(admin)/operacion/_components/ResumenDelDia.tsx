/**
 * EL VISTAZO DEL DÍA SELECCIONADO: LA FILA DE LAS CUATRO MÉTRICAS (plan 10-05).
 *
 * `Aseos activos`, `Sin confirmar`, `Urgentes` y `Gastos`, las cuatro filtradas
 * por la fecha del selector, sin excepción.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA REGLA DE LOS CINCO SEGUNDOS, QUE ES UN CRITERIO Y NO UNA ASPIRACIÓN.
 *
 * El dueño la enunció así el 2026-09-28: el admin entiende el estado del día
 * leyendo SOLO el vistazo. De ahí se derivan las dos decisiones de este archivo:
 *
 *   1. **CUATRO y no cinco.** Si un dato no cambia el comportamiento del admin, no
 *      va acá. Por eso el estado de la conexión del calendario es una señal
 *      pequeña en la cabecera y no una quinta métrica: saber que el iCal sincroniza
 *      bien no cambia nada de lo que el admin va a hacer en los próximos minutos.
 *   2. **SIN CROMO DE TARJETA** (D-05-6). La razón entera vive en la cabecera de
 *      `MetricaDelDia`, que es donde se pintaría el borde.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── ES UN CONTENEDOR Y NO DECIDE NADA ─────────────────────────────────────
 *
 * Recibe las métricas ya compuestas por la página, misma disciplina que
 * `FranjaCarga` con sus chips y que `EstadoAseo` con su estado: quien deriva una
 * cifra es la capa de datos, quien la redacta es la página, y este archivo solo la
 * coloca. Un `if` de negocio acá sería una segunda verdad sobre una cifra que
 * `resumenDelDia()` ya calculó.
 *
 * ── LA REJILLA NACE DE CUATRO AUNQUE HOY BAJE UNA ──────────────────────────
 *
 * Cuatro pistas de `xl:` para arriba y dos por debajo: a 1280px los útiles son
 * 1232 y cada métrica recibe ~296px, de sobra para un rótulo de dos palabras y una
 * cifra de 24px. Por debajo de 1280 la pantalla entera se apila, y cuatro métricas
 * en fila a 800px dejarían los rótulos partidos en tres líneas.
 */
export function ResumenDelDia({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-slot="resumen-dia"
      aria-label="Resumen del día"
      className="grid grid-cols-2 gap-lg xl:grid-cols-4"
    >
      {children}
    </section>
  );
}
