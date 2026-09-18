import { ImageOff } from 'lucide-react';

import { MINIATURAS_VISIBLES, type FotoDelPanel } from '@/lib/data/panel-aseo';

import { DialogoFoto, deQueEsLaFoto } from './DialogoFoto';

/**
 * LA TIRA DE MINIATURAS DEL GRUPO `EVIDENCIA` (08-UI-SPEC §10.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SEIS CASILLAS, Y EL SEIS NO ES UN REDONDEO.
 *
 * Seis miniaturas de 64px con 8px de separación ocupan 6 × 64 + 5 × 8 = **424**
 * de los **448** útiles del cuerpo del panel. Siete necesitarían
 * 7 × 64 + 6 × 8 = 496 y no caben. El número vive en `MINIATURAS_VISIBLES`, en
 * la capa de lectura, porque es el mismo que decide cuántas URL se firman: seis
 * por apertura, nunca doce.
 *
 * ── CON MÁS DE SEIS FOTOS SE PINTAN CINCO Y UNA CASILLA DE CONTEO ────────
 *
 * La sexta posición pasa a ser `+{N}`, con N las que no se ven. Consecuencia
 * declarada por escrito en la cabecera de `MINIATURAS_VISIBLES`: en ese caso la
 * sexta firma se emite y no se llega a usar, o sea **una URL de más por
 * apertura**. Se decidió allá, a propósito, para que la capa de lectura no tenga
 * que conocer esta decisión de maquetación. No se "arregla" acá.
 *
 * ── LA CASILLA DE CONTEO NO ES UN CONTROL, Y ES DELIBERADO ───────────────
 *
 * Cursor por defecto, sin resalte al pasar el mouse, sin foco, y un elemento de
 * lista y no un botón (§13.4). **No abre nada.** Desde el admin no hay forma de
 * ver más de seis fotos de un aseo, y §17.5 lo declara como DEUDA con su
 * sustituto barato ya escrito: que esta casilla abra el mismo diálogo con
 * anterior y siguiente. No se hace hoy porque D8-4 cortó el checklist tarea por
 * tarea y recorrer doce fotos de una en una es eso con otro nombre.
 *
 * Pintarla como si fuera un botón y que no haga nada sería peor que no pintarla.
 *
 * ── LA CASILLA DE AUSENCIA OCUPA SU SITIO, Y NO DESAPARECE ───────────────
 *
 * Una foto purgada, o una cuya firma falló, se pinta como casilla atenuada con
 * su icono. **No se filtra de la tira.** Hacerla desaparecer cambiaría el conteo
 * de la tira y haría creer que había menos evidencia de la que hubo, que es
 * justo lo contrario de lo que un panel de evidencia existe para decir.
 *
 * Por eso la capa de lectura devuelve la posición y el desenlace de cada firma,
 * y no una lista filtrada de las que funcionaron.
 *
 * ── SIN NINGUNA FOTO NO HAY TIRA, HAY UNA LÍNEA ─────────────────────────
 *
 * Y **no se usa el componente de estado vacío**: §11.2 lo reserva para el panel
 * ENTERO sin contenido, y acá lo vacío es un grupo dentro de un panel que sí
 * tiene contenido. Un bloque con icono y encabezado dentro de un panel de cuatro
 * grupos es un grupo gritando más fuerte que los otros tres.
 *
 * Los dos textos son los de §15.2, literales, y cuál de los dos se dice depende
 * del estado del aseo: uno describe un pendiente y el otro describe un hecho
 * consumado.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Cuántas miniaturas se pintan CUANDO hay casilla de conteo.
 *
 * Se deriva del tope en vez de escribir un cinco suelto: son las mismas casillas
 * menos la que se lleva el conteo, y si el tope cambiara por un cambio de ancho
 * del panel, este número lo sigue solo.
 */
const MINIATURAS_CON_CONTEO = MINIATURAS_VISIBLES - 1;

/** El marco común de las tres casillas: mismo tamaño, mismo borde, mismo radio. */
const CASILLA = 'size-miniatura shrink-0 overflow-hidden rounded-md border border-border';

/**
 * La casilla de una foto que ya no se puede mostrar (§10.3, caso 1).
 *
 * El icono va SOLO, sin texto que lo acompañe, así que lleva su etiqueta en vez
 * de esconderse del lector (§13.5). Sin ella, un usuario de lector de pantalla
 * oiría un hueco donde hay un dato.
 */
function CasillaAusente() {
  return (
    <div className={`${CASILLA} flex items-center justify-center bg-muted`}>
      <ImageOff
        className="size-5 text-muted-foreground"
        strokeWidth={2}
        aria-label="Foto no disponible"
      />
    </div>
  );
}

export function TiraDeEvidencia({
  fotos,
  totalDeFotos,
  terminado,
}: {
  /** Como máximo `MINIATURAS_VISIBLES`, ya firmadas y en el orden de la tira. */
  fotos: FotoDelPanel[];
  /**
   * CUÁNTAS TIENE EL ASEO EN TOTAL, no cuántas llegaron firmadas. Es lo que
   * alimenta la casilla de conteo, y no se puede derivar de seis.
   */
  totalDeFotos: number;
  /**
   * Si el aseo ya terminó. Decide CUÁL de los dos vacíos de §15.2 se dice, y
   * llega resuelto desde el panel: la derivación del estado vive en
   * `lib/domain/cleanings.ts` y no se reimplementa acá.
   */
  terminado: boolean;
}) {
  if (totalDeFotos === 0) {
    return (
      <p className="text-micro text-muted-foreground">
        {terminado ? 'Este aseo terminó sin fotos.' : 'Todavía no hay fotos de este aseo.'}
      </p>
    );
  }

  const hayConteo = totalDeFotos > MINIATURAS_VISIBLES;
  const visibles = hayConteo ? fotos.slice(0, MINIATURAS_CON_CONTEO) : fotos;
  const restantes = totalDeFotos - MINIATURAS_CON_CONTEO;

  return (
    /* La tira es una lista (§13.4): son elementos hermanos y contables. */
    <ul className="flex items-center gap-sm">
      {visibles.map((foto) => (
        <li key={foto.fotoId} className="flex">
          {foto.firma.estado === 'firmado' ? (
            <DialogoFoto
              foto={foto}
              url={foto.firma.url}
              disparador={
                <button
                  type="button"
                  /*
                    §13.4: cada miniatura es un BOTÓN con etiqueta accesible
                    descriptiva, NUNCA un contenedor con manejador de clic. Un
                    contenedor con clic no entra en el recorrido de teclado, no
                    responde a la barra espaciadora y no se anuncia como control.
                  */
                  aria-label={`Ver la foto de ${deQueEsLaFoto(foto)}`}
                  className={`transicion ${CASILLA} hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
                >
                  {/*
                    Recorte por COBERTURA en la miniatura, y por contención dentro
                    del diálogo: 64px existen para reconocer la foto, no para
                    leerla.

                    El texto alternativo va vacío y es lo correcto: el botón que
                    la envuelve ya lleva el nombre accesible, y un texto aquí haría
                    que el lector anunciara la misma foto dos veces. La regla de
                    §13.4 de "nunca vacío" es sobre la foto DENTRO DEL DIÁLOGO,
                    que va sola y sin nada que la nombre.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.firma.url} alt="" className="size-full object-cover" />
                </button>
              }
            />
          ) : (
            <CasillaAusente />
          )}
        </li>
      ))}

      {hayConteo ? (
        /*
          LA SEXTA POSICIÓN, Y NO ES UN CONTROL. Sin manejador, sin cursor de
          mano, sin resalte y sin foco. Su etiqueta dice el número en palabras
          porque `+8` a secas se lee mal.
        */
        <li
          aria-label={`${restantes} fotos más`}
          className={`${CASILLA} flex cursor-default items-center justify-center bg-muted text-micro font-semibold text-muted-foreground tabular-nums`}
        >
          <span aria-hidden="true">+{restantes}</span>
        </li>
      ) : null}
    </ul>
  );
}
