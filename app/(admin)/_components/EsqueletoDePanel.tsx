import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * El `fallback` de la barrera de suspensión del panel de lectura
 * (08-UI-SPEC.md §11.1 y §6.4).
 *
 * Su único trabajo es que **la única diferencia al llegar los datos sea que el
 * gris se convierte en texto**. Es la regla que las Fases 2, 4 y 7 ya
 * establecieron para los esqueletos de segmento, aplicada dentro del panel.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA REGLA QUE ESTE ARCHIVO EXISTE PARA DEJAR ESCRITA, PORQUE ES DONDE EL
 * SIGUIENTE LA VA A BUSCAR.
 *
 * **La clave por identificador va sobre EL PANEL**, así:
 *
 *     <PanelLectura key={id} …>
 *       <Suspense fallback={<EsqueletoDePanel grupos={[3, 2, 3]} />}>
 *
 * Va ahí para que abrir un segundo panel no reutilice el árbol del primero
 * (§12.2): sin ella se vería el nombre nuevo dentro del panel viejo, sin volver
 * a hacer su entrada y sin recolocar el foco.
 *
 * **NO va sobre la barrera de suspensión, ni sobre nada que envuelva a la tabla
 * del anfitrión.** Una clave derivada de los parámetros de búsqueda en
 * cualquiera de esos dos sitios reproduce a mano el fixture de Next que FUERZA
 * el remonte del subárbol, y con el remonte se pierden las tres piezas de
 * estado del filtro de `/apartamentos`, que es la mitad del criterio 1 del
 * ROADMAP. Hoy esas tres sobreviven, y sobreviven medidas.
 *
 * ── EL VEREDICTO DEL SPIKE, Y QUÉ RAMA SE TOMÓ ──────────────────────────
 *
 * `08-02-MEDICION.md` §6.1 mide cinco cosas y responde, en las dos rutas y en
 * las dos direcciones:
 *
 *     VEREDICTO 1 (filtro de /apartamentos):  SOBREVIVE
 *     VEREDICTO 2 (scroll de /apartamentos):  SE PIERDE
 *     VEREDICTO 3 (esqueleto del segmento):   NO APARECE
 *     VEREDICTO 6 (la causa del veredicto 2): el archivo de carga del segmento
 *
 * **La rama que se tomó, la del veredicto 3: el esqueleto del segmento NO
 * aparece, cero de doce corridas, porque la respuesta del servidor vuelve en
 * ~70 ms.** Es decir: no habría servido de esqueleto aunque se quedara. El
 * único esqueleto útil es este, el de la barrera propia del panel, con la
 * geometría real. Y como consecuencia del veredicto 6, los dos archivos de
 * carga de segmento de `/apartamentos` y `/operacion` se borraron en este mismo
 * plan, que es lo que devuelve el scroll: con ellos se perdía 3 de 3, sin ellos
 * se conserva 3 de 3.
 *
 * ── LO PROHIBIDO, Y VA POR NOMBRE (§11.1) ───────────────────────────────
 *
 *   1. Nada de girar un icono en el centro, ni en la lista ni en el panel.
 *   2. **Nada de atenuar la lista de detrás** bajando su opacidad y apagándole
 *      los eventos de puntero. Ese patrón era correcto en la Fase 7 porque las
 *      cifras iban a cambiar; acá la lista es exactamente la misma antes y
 *      después, y atenuarla dice que pasó algo donde no pasó nada.
 *   3. Nada de que el panel aparezca solo cuando llegan los datos. El clic
 *      quedaría sin respuesta durante el viaje y el admin volvería a tocar.
 *
 * ── EL PIE NO SE ESQUELETIZA, Y POR ESO NO ESTÁ AQUÍ ────────────────────
 *
 * Los botones del pie son navegación: no dependen del dato y se renderizan con
 * su label real desde el primer frame (§11.1 punto 3). Este componente es el
 * fallback del CUERPO.
 *
 * ── LAS ALTURAS, Y EL PÍXEL QUE SE PIERDE EN CADA LÍNEA ─────────────────
 *
 * §6.4 cuenta el presupuesto en líneas de 21px (cuerpo) y 17px (micro), que
 * salen de las alturas de línea de §3. La escala de espaciado numérica de
 * Tailwind llega a 20 y a 16, y §2 prohíbe el valor arbitrario, así que cada
 * línea gris mide **un píxel menos que la línea de texto que sustituye**. Las
 * separaciones sí son exactas: 8px entre filas, 8px bajo el encabezado del
 * grupo, y 16 + 1 + 16 en el separador.
 *
 * El error acumulado del panel más cargado de la fase (nueve filas de cuerpo y
 * cuatro encabezados) son 13px sobre 464, que es menos de lo que se mueve el
 * texto real entre dos apartamentos con nombres de distinto largo. Declarar un
 * token de alto para ahorrarse eso costaría dos tokens nuevos en una fase que
 * declara uno.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Los anchos de las barras de valor, en ciclo. Deterministas a propósito: un
 * ancho al azar cambiaría entre el render del servidor y el del cliente y
 * rompería la hidratación.
 */
const ANCHOS_DE_VALOR = ['w-20', 'w-28', 'w-16', 'w-24'] as const;

/** Una fila dato-valor en gris: rótulo a la izquierda, valor a la derecha. */
function FilaEnGris({ indice }: { indice: number }) {
  return (
    <div className="flex items-center justify-between gap-md">
      {/* La etiqueta es micro: 17px de línea, 16 de barra. */}
      <Skeleton className="h-4 w-24" />
      {/* El valor es cuerpo: 21px de línea, 20 de barra. */}
      <Skeleton
        className={`h-5 ${ANCHOS_DE_VALOR[indice % ANCHOS_DE_VALOR.length]}`}
      />
    </div>
  );
}

export function EsqueletoDePanel({
  grupos,
  cabecera = false,
}: {
  /**
   * Un número por grupo, y el número es cuántas filas tiene ese grupo en el
   * caso típico. La longitud del arreglo es cuántos grupos pinta: §6.3 tope en
   * cuatro.
   *
   * Ejemplo, el panel de apartamento de §6.4: `[3, 2, 3, 1]`.
   */
  grupos: readonly number[];
  /**
   * Las dos barras de cabecera de §11.1, la del nombre y la de la línea de
   * apoyo.
   *
   * **Apagada por defecto, y no es un olvido.** §11.4 obliga a la página a
   * resolver el identificador CONTRA LO QUE YA LEYÓ, no contra la base, así que
   * el nombre de lo seleccionado y su línea de apoyo están disponibles en el
   * primer render y `PanelLectura` los pinta de verdad. Un nombre en gris donde
   * cabe el nombre real es una regresión, no un esqueleto. Los cuatro paneles
   * de esta fase la dejan apagada.
   *
   * La bandera existe para el día que un panel no pueda conocer su nombre sin
   * una lectura. Ese día la barrera de suspensión envuelve al panel entero y no
   * solo a su cuerpo.
   */
  cabecera?: boolean;
}) {
  return (
    <div className="flex flex-col gap-lg" aria-busy="true" aria-live="polite">
      {cabecera ? (
        <div className="flex flex-col gap-sm">
          {/* El nombre va en `heading`: 21px de línea, 20 de barra. */}
          <Skeleton className="h-5 w-48" />
          {/* La línea de apoyo va en micro: 17px de línea, 16 de barra. */}
          <Skeleton className="h-4 w-32" />
        </div>
      ) : null}

      {grupos.map((filas, grupo) => (
        <div key={grupo} className="flex flex-col gap-lg">
          <div className="flex flex-col gap-sm">
            {/* El encabezado del grupo: micro, y cuesta 17 + 8 = 25px. */}
            <Skeleton className="h-4 w-32" />

            {Array.from({ length: filas }, (_, fila) => (
              <FilaEnGris key={fila} indice={grupo + fila} />
            ))}
          </div>

          {/*
            El separador entre grupos, con 16px a cada lado que pone la
            separación de este contenedor. El último grupo no lo lleva, igual
            que en el cuerpo de verdad.
          */}
          {grupo < grupos.length - 1 ? <Separator /> : null}
        </div>
      ))}

      <span className="sr-only">Cargando el detalle</span>
    </div>
  );
}
