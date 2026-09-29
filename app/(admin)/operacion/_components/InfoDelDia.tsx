import type { ReactNode } from 'react';

/**
 * EL ESTADO DE LA COLUMNA DERECHA SIN NADA SELECCIONADO (plan 10-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA COLUMNA DERECHA **NUNCA** ESTÁ VACÍA. Lo pidió el dueño con esas palabras el
 * 2026-09-28: el detalle del aseo seleccionado a la derecha, y sin nada
 * seleccionado la información general del día, **nunca una caja vacía**.
 *
 * Una columna del 70% del ancho esperando a que alguien pulse algo es el defecto
 * que este componente existe para evitar: ocupa el sitio más grande de la pantalla
 * y no dice nada, así que el admin aprende a no mirarlo.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── ES UN CONTENEDOR Y NO DECIDE NADA ────────────────────────────────────
 *
 * Recibe sus piezas ya compuestas por la página, misma disciplina que
 * `ResumenDelDia` con sus métricas: quien deriva un dato es la capa de datos, quien
 * lo redacta es la página, y este archivo solo lo coloca. Las piezas son la carga
 * por aseador del día, el desglose, lo que queda más allá del horizonte, la leyenda
 * de los seis estados y el botón de crear aseo.
 *
 * ── LO QUE SE MUDÓ ACÁ, Y NO SE PERDIÓ ───────────────────────────────────
 *
 * La línea de `Hay N aseos programados después del …` vivía al pie del carril ancho
 * de la pantalla vieja, que ya no existe. **No se borra: se muda**, y va escrito,
 * porque la razón por la que existía sigue vigente (T-05-54): lo que queda afuera de
 * la ventana NO SE ESCONDE, se dice cuánto hay y dónde verlo.
 *
 * Su hermana por el otro extremo —`Hay N aseos sin cerrar de antes del …`— **no se
 * muda acá**, y también va escrito: su información la da ahora la métrica de
 * `Sin confirmar` con su `+N en otros días` (D-05-7), y repetirla sería decir dos
 * veces lo mismo en la misma pantalla.
 */
export function InfoDelDia({
  cabecera,
  children,
}: {
  /**
   * El encabezado del bloque, ya redactado por la página: dice de qué día habla.
   * Va acá y no compuesto dentro porque la página es la única que sabe si el día
   * efectivo es el de negocio de Bogotá.
   */
  cabecera: string;
  children: ReactNode;
}) {
  return (
    // `overflow-y-auto` y `min-h-0`: la columna derecha scrollea POR DENTRO, igual
    // que la izquierda. Es la otra mitad de "la página no scrollea".
    //
    // SIN borde y SIN fondo de card, por el principio de data ink: esto no es una
    // tarjeta flotando, es el contenido de la columna. Lo que lo separa de la lista
    // es el `gap-2xl` de la rejilla, que son 32px de aire.
    <section
      data-slot="info-dia"
      aria-label={cabecera}
      className="flex min-h-0 flex-col gap-xl overflow-y-auto"
    >
      <h2 className="text-heading text-foreground">{cabecera}</h2>

      {children}
    </section>
  );
}
