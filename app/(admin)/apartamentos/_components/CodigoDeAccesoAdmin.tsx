'use client';

import { Check, Copy, Eye, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { FilaDeDato } from '../../_components/FilaDeDato';
import { revelarCodigoDeAcceso } from '../_actions';

/**
 * EL CÓDIGO DE LA CERRADURA EN EL PANEL DEL ADMIN (08-UI-SPEC §7.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SE PIDE CON UN GESTO. NO SALE AL ABRIR, Y LA RAZÓN ESTÁ MEDIDA.
 *
 * La dirección de este panel es COMPARTIBLE POR DISEÑO: es el criterio 2 del
 * ROADMAP, el enlace se pega en un chat y abre lo mismo. Un código renderizado
 * al abrir se entrega a quien sea que abra ese chat, más a quien pase por detrás
 * de la pantalla, más a cualquier captura.
 *
 * Y no bastaría con esconderlo detrás de un `useState`: **lo que se pasa como
 * prop a un componente de cliente viaja en la carga de React y queda en el
 * documento aunque no se pinte.** Esa frase es literal del precedente que ya
 * existe en el repo sobre ESTA MISMA TABLA —la página de conexión de
 * calendario— y su caso de punta a punta lo comprueba contra el documento
 * entero, no contra lo que se ve (T-02-74).
 *
 * De ahí sale la forma de las props de abajo: entra el identificador y entra un
 * booleano. El valor NO ENTRA. La única forma de traerlo es la acción.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ ESTE COMPONENTE NO ES EL DEL ÁRBOL DEL ASEADOR (§14.2) ─────────
 *
 * El nombre es distinto a propósito, y no es duplicación por descuido. No
 * comparten NADA de las tres cosas que importan:
 *
 *   1. **El copy.** El del aseador promete una constancia de cada apertura y esa
 *      promesa allá es cierta. Acá sería falsa, y está desarrollado abajo.
 *   2. **La escala tipográfica.** Allá el código se lee de pie, frente a una
 *      puerta, a distancia de brazo: va a 28px con la escala móvil. Acá se lee
 *      sentado, a 60cm, dentro de una fila de un panel de 480px.
 *   3. **El camino a la base.** Allá es un procedimiento de la base con ventana
 *      temporal; acá es la guarda de admin más el cliente administrativo.
 *
 * Fundirlos en un componente con banderas produciría un componente que hay que
 * leer entero para saber qué hace en cada árbol.
 *
 * ── LA FRASE QUE ESTE COMPONENTE NO ESCRIBE, Y ES LO ÚNICO QUE HAY QUE
 *    RECORDAR DE TODO EL ARCHIVO ──────────────────────────────────────────
 *
 * El componente hermano del árbol del aseador cierra con una línea que le
 * promete al aseador que cada apertura deja rastro. Allá es verdad, y es
 * comprobable: ese camino escribe una fila de huella en la MISMA transacción,
 * antes de devolver, y es el único punto del sistema que lo hace.
 *
 * **El camino del admin no deja rastro de ninguna clase.** Copiar esa línea acá
 * sería escribir una mentira en la interfaz, que es peor que no decir nada:
 * quien la lea va a creer que hay una lista de aperturas que no existe. §17.6 lo
 * deja escrito como deuda del contrato, y la salida, el día que haga falta, es
 * un procedimiento nuevo en la base, no un cambio de texto acá.
 *
 * Y siguiendo §14.6 punto 2, este párrafo describe el motivo sin escribir
 * ninguna de las palabras de esa frase: los guardarraíles trabajan por expresión
 * regular sobre el código, y un comentario que cite un literal prohibido rompe
 * la revisión aunque el código esté bien.
 *
 * ── EL VALOR VIVE EN EL ESTADO DE REACT Y MUERE CON EL DESMONTAJE ──────────
 *
 * Ni almacenamiento local, ni de sesión, ni base de datos del navegador, ni
 * cachés del trabajador de servicio, ni ninguna revalidación de Next. Es la
 * misma regla que impone el componente del árbol del aseador y por la misma
 * razón: un computador compartido, o el que se queda abierto en el escritorio
 * de una oficina, convierte un secreto efímero en uno guardado y legible sin
 * sesión. Cerrar el panel desmonta esto, y con eso basta.
 *
 * ── NO SE AUTO OCULTA Y NO HAY BOTÓN PARA OCULTARLO ────────────────────────
 *
 * No hay temporizador de escondido y no existe el icono del ojo tachado: §14.5
 * lo deja fuera de la lista cerrada a propósito. El admin dicta el código por
 * teléfono, y que desaparezca a mitad de la llamada lo obligaría a pedirlo otra
 * vez con el interlocutor esperando. El único temporizador del archivo es el
 * segundo y medio de la confirmación de la copia.
 */

// ── El copy literal de §15.2, en constantes con nombre ───────────────────────
// Al principio y no interpolado en el árbol: así quien compara con el contrato
// lee una lista y no un JSX.

const ETIQUETA = 'Código de acceso';
const MASCARA = '••••••';
const CTA_MOSTRAR = 'Mostrar';
const CTA_COPIAR = 'Copiar el código';
const EN_VUELO = 'Abriendo…';
const CONFIRMACION_COPIADO = 'Copiado.';

const ERROR_TITULO = 'No se pudo abrir el código.';
const ERROR_CUERPO = 'Vuelve a tocar. Si sigue igual, míralo en la ficha de edición.';

/** El espejo de los dos valores que el CHECK de la base admite. */
const NOMBRE_DE_CERRADURA: Record<string, string> = {
  inteligente: 'Cerradura inteligente',
  llave_fisica: 'Llave física',
};

/**
 * Los cinco momentos de §7.3, como una unión y no como banderas sueltas.
 *
 * Es la misma razón que ya escribió el componente del árbol del aseador: con
 * banderas es posible pintar a la vez un código y un error, y ese código sería
 * el de un intento anterior. Con una unión, el compilador lo impide.
 */
type Vista =
  | { fase: 'oculto' }
  | { fase: 'en_vuelo' }
  | { fase: 'revelado'; codigo: string }
  /** `tipoCerradura` solo se conoce si la acción llegó a responder. */
  | { fase: 'sin_codigo'; tipoCerradura: string | null }
  | { fase: 'error' };

export function CodigoDeAccesoAdmin({
  apartamentoId,
  hayCodigo,
}: {
  /** El identificador del apartamento. Es lo único con lo que se pide. */
  apartamentoId: string;
  /**
   * SI HAY CÓDIGO DETRÁS, NO CUÁL ES. Un booleano no puede filtrar nada, y es
   * lo que permite elegir entre el estado oculto y el estado sin código antes
   * de que nadie pulse: un botón que abre un vacío es un viaje para nada.
   */
  hayCodigo: boolean;
}) {
  /** AQUÍ VIVE EL SECRETO Y EN NINGÚN OTRO SITIO. */
  const [vista, setVista] = useState<Vista>(
    hayCodigo ? { fase: 'oculto' } : { fase: 'sin_codigo', tipoCerradura: null },
  );
  const [copiado, setCopiado] = useState(false);
  const [, iniciar] = useTransition();

  /**
   * El único temporizador del archivo: el segundo y medio de la marca de
   * verificación. Se limpia al desmontar porque el panel se cierra con un clic
   * y el temporizador le sobreviviría medio segundo, escribiendo en un
   * componente que ya no está.
   */
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (reloj.current !== null) clearTimeout(reloj.current);
    };
  }, []);

  function pedirCodigo() {
    setVista({ fase: 'en_vuelo' });

    iniciar(async () => {
      const r = await revelarCodigoDeAcceso(apartamentoId);

      if (!r.ok) {
        setVista({ fase: 'error' });
        return;
      }

      // El código pudo desaparecer entre que el panel se pintó y el admin
      // pulsó. No es un error: es que ya no hay nada que mostrar, y entonces la
      // fila cae al estado de ausencia con el tipo de cerradura, que es lo que
      // explica POR QUÉ no hay código.
      if (r.codigo === null) {
        setVista({ fase: 'sin_codigo', tipoCerradura: r.tipoCerradura });
        return;
      }

      setVista({ fase: 'revelado', codigo: r.codigo });
    });
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      if (reloj.current !== null) clearTimeout(reloj.current);
      reloj.current = setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Si el portapapeles no está disponible NO se confirma nada. Decirle al
      // admin que copió algo que no está en el portapapeles es peor que no
      // ofrecer el botón: lo va a pegar en el chat y va a dictar otra cosa.
      setCopiado(false);
    }
  }

  // ── SIN CÓDIGO: LA AUSENCIA, Y SIN BOTÓN ──────────────────────────────────
  // `sin definir` y no `no aplica`: el código todavía no existe y alguien tiene
  // que ir a llenarlo en la ficha de edición. La base no lo prohíbe.
  if (vista.fase === 'sin_codigo') {
    const nombre =
      vista.tipoCerradura === null ? null : (NOMBRE_DE_CERRADURA[vista.tipoCerradura] ?? null);

    return nombre === null ? (
      <FilaDeDato etiqueta={ETIQUETA} valor={null} ausencia="sin definir" />
    ) : (
      <FilaDeDato
        etiqueta={ETIQUETA}
        valor={
          <span className="flex flex-col items-end">
            <span className="text-muted-foreground">
              <span aria-hidden="true">—</span>
              <span className="sr-only">sin definir</span>
            </span>
            <span className="text-micro text-muted-foreground">{nombre}</span>
          </span>
        }
      />
    );
  }

  return (
    <FilaDeDato
      etiqueta={ETIQUETA}
      cifra
      valor={
        <span className="flex flex-col items-end gap-sm">
          {vista.fase === 'revelado' ? (
            <span className="flex items-center gap-sm">
              {/*
                LA REGIÓN QUE SE ANUNCIA CON CORTESÍA (§13.3). El código NO lleva
                `aria-hidden` y NO se marca como campo de contraseña: es un dato
                que hay que poder DICTAR POR TELÉFONO, y un campo de contraseña
                no se lee.

                Mono, con el espaciado entre letras del código y numerales
                tabulares. Es la única excepción de familia de toda la fase, y la
                razón ya está escrita en el componente del árbol del aseador:
                la ambigüedad entre cero y O mayúscula, o entre uno y ele, al
                dictar un código es un modo de fallo real.
              */}
              <span
                aria-live="polite"
                className="max-w-codigo truncate rounded-md bg-muted px-sm font-mono text-body font-semibold tracking-codigo tabular-nums"
              >
                {vista.codigo}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={CTA_COPIAR}
                onClick={() => void copiar(vista.codigo)}
              >
                {copiado ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-sm">
              {/*
                LA MÁSCARA SON SEIS PUNTOS LITERALES, no el código enmascarado.
                La diferencia la fijó el plan 08-06 y no es cosmética: una
                máscara derivada del código real tendría que haber leído el
                código, y lo que se lee en el servidor de un componente que se
                renderiza acaba en el documento con una línea de descuido. Seis
                puntos escritos a mano no pueden filtrar nada.
              */}
              <span className="text-muted-foreground">
                <span aria-hidden="true">{MASCARA}</span>
                <span className="sr-only">oculto</span>
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                // El ancho MÍNIMO de la Wave 1, y no es cosmético: sin él el
                // botón pasa de `Mostrar` a `Abriendo…` y SALTA DE ANCHO en
                // vuelo, que es justo lo que el contrato de la Fase 4 prohíbe.
                // El número sale de contar la palabra más larga de las dos.
                className="min-w-boton-mostrar"
                // Se deshabilita SOLO mientras el girador está a la vista. Un
                // botón muerto sin señal es indistinguible de uno roto.
                disabled={vista.fase === 'en_vuelo'}
                onClick={pedirCodigo}
              >
                {vista.fase === 'en_vuelo' ? (
                  <>
                    {/*
                      El giro es la ÚNICA excepción declarada desde la Fase 2 a
                      la preferencia de movimiento reducido, y ya está resuelta
                      en la hoja global: con la preferencia activa todo baja a
                      duración cero menos esto. Congelarlo dejaría al admin
                      mirando un icono quieto sin saber si la petición sigue
                      viva.
                    */}
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    {EN_VUELO}
                  </>
                ) : (
                  <>
                    <Eye aria-hidden="true" />
                    {CTA_MOSTRAR}
                  </>
                )}
              </Button>
            </span>
          )}

          {/*
            EL ERROR VIVE EN ESTA FILA Y NO FLOTA POR ENCIMA DE LA PANTALLA
            (§7.3). El admin está mirando acá, que es donde acaba de pulsar; un
            aviso flotante en la esquina obliga a mover los ojos para leer algo
            que pertenece a esta línea, y se va solo antes de que termine de
            leerlo.
          */}
          {vista.fase === 'error' ? (
            <Alert
              variant="destructive"
              className="border-destructive/30 bg-surface-destructive text-left"
            >
              <TriangleAlert aria-hidden="true" />
              <AlertTitle className="text-micro">{ERROR_TITULO}</AlertTitle>
              <AlertDescription className="text-micro">{ERROR_CUERPO}</AlertDescription>
            </Alert>
          ) : null}

          {/*
            La confirmación de la copia, que se anuncia con cortesía (§13.3).
            EXISTE SIEMPRE, aunque esté vacía: una región que se monta a la vez
            que su contenido no se anuncia en varios lectores de pantalla.
          */}
          <span aria-live="polite" className="text-micro text-muted-foreground">
            {copiado ? CONFIRMACION_COPIADO : null}
          </span>
        </span>
      }
    />
  );
}
