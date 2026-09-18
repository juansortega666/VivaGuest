'use client';

import { useId, type ReactNode } from 'react';

import { Separator } from '@/components/ui/separator';

/**
 * Un grupo del cuerpo del panel de lectura (08-UI-SPEC.md §6.3).
 *
 * Encabezado en versalita, lista de definición con sus filas, y el separador
 * que lo despega del grupo siguiente.
 *
 * ── POR QUÉ ES UN COMPONENTE DE CLIENTE, QUE ES LA PREGUNTA RAZONABLE ────
 *
 * No pinta nada interactivo. Lo único que necesita del cliente es el generador
 * de identificadores de React, y hace falta porque §13.2 pide que la sección
 * esté ETIQUETADA POR su encabezado, y eso se escribe con una referencia por
 * identificador. Derivar el identificador del texto sería más barato y más
 * frágil: catorce encabezados fijos hoy, dos iguales el día que un panel repita
 * `DINERO`. Hay precedente del generador en cinco componentes del árbol del
 * aseador.
 *
 * ── EL ENCABEZADO LLEGA EN MAYÚSCULA, Y NO SE TRANSFORMA AQUÍ ────────────
 *
 * La clase de versalita transforma el GLIFO pero no el TEXTO del DOM, así que
 * una lectura plana del panel, un lector de pantalla o una aserción sobre el
 * contenido verían el texto en minúscula. §15.2 fija el copy literal de los
 * catorce encabezados de la fase, y el copy es lo que tiene que llegar. Es el
 * criterio que `SheetDesglosePago` ya aplica en su propio componente de
 * sección, y se copia tal cual.
 *
 * **Este componente no transforma el texto, solo lo estiliza.**
 *
 * ── UN GRUPO DE UNA SOLA FILA NO LLEVA ENCABEZADO ───────────────────────
 *
 * Y la cuenta está hecha: un rótulo sobre un solo dato son **25px** (17 del
 * encabezado más 8 de separación) gastados en decir dos veces lo mismo, sobre
 * un cuerpo que a 700px de viewport tiene 506px con pie. Si un grupo se queda
 * con una fila, la fila sube al grupo de arriba. El encabezado es opcional
 * justamente para eso, y sin él no se abre sección: una sección sin nombre no
 * se anuncia como región, que es lo correcto para un dato suelto.
 *
 * ── EL CONTEO DEL ENCABEZADO NO LO CALCULA ESTE COMPONENTE ──────────────
 *
 * La forma `RESPONSABLE DE (12)` es parte del texto que llega como prop. **Este
 * componente no cuenta nada, no formatea nada y no deriva nada.** Un componente
 * que calcula es un componente que hay que probar dos veces.
 */
export function GrupoDePanel({
  encabezado,
  conSeparador = false,
  children,
}: {
  /**
   * El copy de §15.2, **ya en mayúscula**. Opcional: un grupo de una sola fila
   * no lo lleva.
   */
  encabezado?: string;
  /**
   * El separador que va DEBAJO. Lo llevan todos los grupos menos el último.
   *
   * Cuesta 33px: 16 de separación por arriba, 1 del filo y 16 por abajo. Los
   * 16 de cada lado los pone el cuerpo del panel con su propia separación, así
   * que el filo es hermano del grupo y no hijo suyo.
   */
  conSeparador?: boolean;
  /** Las filas, que son `FilaDeDato`. */
  children: ReactNode;
}) {
  const idEncabezado = useId();

  const filas = <dl className="flex flex-col gap-sm">{children}</dl>;

  return (
    <>
      {encabezado === undefined ? (
        filas
      ) : (
        <section aria-labelledby={idEncabezado} className="flex flex-col gap-sm">
          {/*
            Nivel 3, y la jerarquía no se salta: el título del panel es el nivel
            2, y lo pone `SheetTitle` (§13.2).
          */}
          <h3
            id={idEncabezado}
            className="text-micro font-semibold tracking-columna text-muted-foreground uppercase"
          >
            {encabezado}
          </h3>
          {filas}
        </section>
      )}

      {conSeparador ? <Separator /> : null}
    </>
  );
}
