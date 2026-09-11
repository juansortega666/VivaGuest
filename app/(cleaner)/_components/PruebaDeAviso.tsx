'use client';

import { CircleCheck, Loader2, Send, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

import {
  confirmarPruebaAMano,
  confirmarPruebaPorToque,
  enviarAvisoDePrueba,
} from '@/app/(cleaner)/instalar/_actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * EL PASO 4 DEL ASISTENTE: LA PRUEBA. ES EL CONTRATO DE D-02 (05-UI-SPEC §8.6).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA INSTALACION NO TERMINA CUANDO LA APP APARECE EN LA PANTALLA DE INICIO.
 * TERMINA CUANDO LLEGO UN AVISO DE PRUEBA A ESTE TELEFONO.
 *
 * Textual del usuario, y el contexto de la fase avisa de que no se puede
 * suavizar a "otorgar el permiso". De ahi salen las dos decisiones de forma que
 * este archivo implementa y que parecen adorno hasta que se leen juntas:
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── 1. TRES ESTADOS VISUALMENTE DISTINTOS, NO UN BOTON QUE SE PONE VERDE ────
 *
 * Cambian el FONDO del bloque, el ICONO y el TEXTO DE APOYO a la vez. Un botón
 * que cambia de color se lee como "ya toqué", no como "ya llegó", y esas dos
 * cosas son justo las que esta pantalla existe para separar.
 *
 * ── 2. DOS GRADOS DE CONFIRMACION, Y EL ADMIN VE CUAL FUE ───────────────────
 *
 *   · POR TOQUE (el bueno). El aviso navega a `/instalar?prueba={token}`. Al
 *     abrirse ahi, este componente consume el token UNA VEZ. Es la unica
 *     evidencia que no depende de que nadie diga nada: el aviso se pinto, era
 *     tocable, y alguien lo toco.
 *   · A MANO (el flojo). Visible SOLO mientras se espera. Deja al aseador en
 *     `Sin probar` a ojos del admin (§5.2).
 *
 * Si no se distinguieran, el boton secundario seria un atajo para saltarse la
 * unica verificacion de la fase (T-05-36). Por eso, tras confirmar, el
 * componente REPORTA EL GRADO hacia arriba: la pantalla de cierre le dice al
 * aseador, de frente, que su administrador va a ver que no se comprobo tocando
 * el aviso. Es honesto y evita la sorpresa cuando lo llamen a repetirlo.
 *
 * ── EL CONTADOR NO SE OCULTA. NUNCA ────────────────────────────────────────
 *
 * §8.7: *"ocultar el contador y luego cortar de golpe es la forma de que el
 * aseador crea que la app se congeló"*. Desde el primer envio se ve `Intento N
 * de 3`, y cuando se agota el bloque lo DICE en vez de dejar un boton muerto.
 *
 * Antes del primer envio no hay contador, porque no hay nada que contar:
 * `Intento 0 de 3` es ruido delante de alguien que todavia no ha tocado nada.
 *
 * ── Y EL TOPE DE VERDAD NO ES ESTE CONTADOR ────────────────────────────────
 *
 * El control vive en `public.registrar_prueba_de_aviso()`, que cuenta con
 * `for update` y lanza al cuarto. Este numero es CORTESIA DE PANTALLA. La razon
 * es que este camino manda un push de verdad y un boton que dispara envios en
 * bucle es un amplificador (T-05-08): un tope de navegador se salta abriendo la
 * consola. Cuando la action devuelve `topeAgotado`, el estado pasa a agotado
 * aunque la cuenta local dijera otra cosa — la base manda.
 *
 * ── CERO ROJO EN ESTE BLOQUE (§4.2) ────────────────────────────────────────
 *
 * Que no llegue un aviso de prueba no es una accion destructiva ni un error del
 * aseador: puede ser el telefono, la version del sistema o la conexion. El token
 * de las acciones que revocan o borran esta reservado a eso desde `02-UI-SPEC`
 * §4.6 y aqui no aparece ni una vez, comentarios incluidos, que es por lo que
 * este parrafo no lo nombra. Y cero dialogo de confirmacion (§18.2): esta fase
 * no tiene ni una accion destructiva.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COPY — literal de §8.6, §8.7 y §18.1. No se reescribe.
// ═══════════════════════════════════════════════════════════════════════════════

const ENCABEZADO =
  'Te mandamos un aviso de prueba a este teléfono. La instalación no está lista hasta que llegue.';

const CTA_PRIMERA = 'Enviar aviso de prueba';
const CTA_REINTENTO = 'Enviar de nuevo';
const CTA_EN_VUELO = 'Enviando…';

const ESPERANDO_TITULO = 'Enviado. Espera a que suene el teléfono…';
const ESPERANDO_APOYO = 'Puede tardar unos segundos. Si no llega en un minuto, vuelve a enviarlo.';

const LLEGO_TITULO = 'Llegó. Este teléfono ya recibe los avisos.';

const NO_LLEGO_TITULO = 'No ha llegado.';
const NO_LLEGO_APOYO =
  'Vuelve a enviarlo. Si a la tercera no llega, este teléfono no puede recibir avisos: avísale a tu administrador.';

const AGOTADO_TITULO = 'Este teléfono no está recibiendo avisos.';
const AGOTADO_APOYO =
  'Probamos 3 veces y no llegó ninguno. Avísale a tu administrador: puede ser el teléfono, la versión del sistema o la conexión.';

/** El tope de §8.7. El mismo numero que cuenta la base, escrito una sola vez. */
const TOPE_DE_INTENTOS = 3;

// ═══════════════════════════════════════════════════════════════════════════════

/** Los dos grados de `public.grado_verificacion_aviso`. */
export type GradoDeVerificacion = 'toque' | 'manual';

/**
 * Los cinco estados internos. Tres son los visibles de §8.6; `inicial` es antes
 * del primer envio y `agotado` es §8.7.
 */
type EstadoDePrueba = 'inicial' | 'esperando' | 'llego' | 'no_llego' | 'agotado';

export function PruebaDeAviso({
  endpoint,
  token,
  gradoPrevio,
  intentosPrevios = 0,
  alConfirmar,
}: {
  /** El endpoint de la suscripcion vigente de ESTE navegador. */
  endpoint: string;
  /**
   * El token de `/instalar?prueba={token}`, si la pagina se abrio desde el
   * aviso. Es lo que produce la confirmacion por toque.
   */
  token?: string | null;
  /** El grado que esa suscripcion YA tuviera. Viene del servidor. */
  gradoPrevio?: GradoDeVerificacion | null;
  /** Los intentos ya gastados, para que el contador no arranque de cero. */
  intentosPrevios?: number;
  /**
   * Le dice al asistente que el paso 4 quedo cerrado, y CON QUE GRADO. La
   * pantalla de cierre necesita el grado: con `manual` anade la nota de §8.6.
   */
  alConfirmar?: (grado: GradoDeVerificacion) => void;
}) {
  const [estado, setEstado] = useState<EstadoDePrueba>(
    gradoPrevio !== null && gradoPrevio !== undefined ? 'llego' : 'inicial',
  );
  const [intentos, setIntentos] = useState(intentosPrevios);
  const [enVuelo, setEnVuelo] = useState(false);
  const [, iniciar] = useTransition();

  /**
   * LA CONFIRMACION POR TOQUE SE DISPARA UNA SOLA VEZ.
   *
   * El token se consume EN EL SERVIDOR, asi que un refresco no vuelve a
   * confirmar y este componente no tiene que recordarlo entre montajes. El `ref`
   * cubre lo otro: que el modo estricto de React monte dos veces el mismo efecto
   * en desarrollo y se manden dos llamadas por un solo toque.
   *
   * Y si el token ya estaba consumido o es de otra sesion, la action devuelve un
   * resultado NEUTRO y no un error. Es deliberado: el navegador puede reabrir la
   * misma URL, y pintarle un fallo al aseador justo cuando todo salio bien seria
   * el peor momento posible para equivocarse.
   */
  const tokenConsumido = useRef(false);

  useEffect(() => {
    if (!token || tokenConsumido.current) return;
    tokenConsumido.current = true;

    void (async () => {
      await confirmarPruebaPorToque(token);
      setEstado('llego');
      alConfirmar?.('toque');
    })();
  }, [token, alConfirmar]);

  function enviar() {
    setEnVuelo(true);
    iniciar(() => {
      void (async () => {
        const datos = new FormData();
        datos.set('endpoint', endpoint);

        const r = await enviarAvisoDePrueba(null, datos);

        if (r.ok) {
          setIntentos((n) => Math.min(n + 1, TOPE_DE_INTENTOS));
          setEstado('esperando');
        } else if (r.topeAgotado === true) {
          // La base dijo que se acabo. Manda ella, no la cuenta local.
          setIntentos(TOPE_DE_INTENTOS);
          setEstado('agotado');
        } else {
          setEstado('no_llego');
        }

        setEnVuelo(false);
      })();
    });
  }

  function confirmarAMano() {
    setEnVuelo(true);
    iniciar(() => {
      void (async () => {
        const r = await confirmarPruebaAMano(endpoint);
        if (r.ok) {
          setEstado('llego');
          alConfirmar?.('manual');
        }
        setEnVuelo(false);
      })();
    });
  }

  const presentacion = PRESENTACION[estado];
  const Icono = presentacion.icono;
  const quedanIntentos = intentos < TOPE_DE_INTENTOS;
  const cerrado = estado === 'llego';

  return (
    <div className="flex flex-col gap-lg">
      <p className="text-body-movil text-foreground">{ENCABEZADO}</p>

      {/*
        `aria-live="polite"` y no `assertive` (§16.3): la llegada del aviso de
        prueba se anuncia, pero sin interrumpir a quien este leyendo las
        instrucciones del paso. La region se monta SIEMPRE, aunque el estado sea
        `inicial` y no pinte nada dentro: una region que aparece a la vez que su
        contenido no se anuncia en varios lectores.
      */}
      <div aria-live="polite">
        {presentacion.titulo !== null && (
          <div
            className={cn(
              'flex items-start gap-sm rounded-lg p-lg',
              presentacion.fondo,
            )}
          >
            <Icono
              className={cn('size-5 shrink-0', presentacion.claseIcono)}
              strokeWidth={2}
              aria-hidden="true"
            />

            <div className="flex flex-col gap-xs">
              <p className="text-body-movil text-foreground">{presentacion.titulo}</p>
              {presentacion.apoyo !== null && (
                <p className="text-micro-movil text-muted-foreground">{presentacion.apoyo}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {!cerrado && (
        // `gap-sm` son los 8px minimos de §16.1 entre dos controles adyacentes.
        // Dos botones de 44px pegados producen toques equivocados con guantes
        // tan seguro como un botón de 30px.
        <div className="flex flex-col gap-sm">
          <Button
            type="button"
            // 56px (`--spacing-toque-comodo`, §2.2): es la accion primaria del
            // paso. Se apaga en vuelo y cuando ya no quedan intentos, y en ese
            // segundo caso el bloque de arriba DICE por que, en vez de dejar un
            // control muerto sin explicacion.
            className="min-h-toque-comodo w-full text-body-movil"
            disabled={enVuelo || !quedanIntentos}
            onClick={enviar}
          >
            {enVuelo ? (
              <>
                {/* Sigue girando con `prefers-reduced-motion: reduce`: es
                    informacion de estado, no decoracion, y `app/globals.css`
                    declara esa excepcion desde la Fase 2. */}
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                {CTA_EN_VUELO}
              </>
            ) : (
              <>
                <Send className="size-5" aria-hidden="true" />
                {estado === 'inicial' ? CTA_PRIMERA : CTA_REINTENTO}
              </>
            )}
          </Button>

          {estado === 'esperando' && (
            // SOLO mientras se espera. Nunca en `llegó` ni antes del primer
            // envio: sin envio previo no hay nada que confirmar, y el RPC lo
            // rechazaria de todas formas con su propio texto.
            <Button
              type="button"
              variant="ghost"
              className="min-h-toque w-full text-body-movil text-muted-foreground"
              disabled={enVuelo}
              onClick={confirmarAMano}
            >
              Ya sonó, no alcancé a tocarlo
            </Button>
          )}

          {intentos > 0 && quedanIntentos && (
            <p className="text-micro-movil tabular-nums text-muted-foreground">
              {`Intento ${intentos} de ${TOPE_DE_INTENTOS}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * LA TABLA DE §8.6 Y §8.7, ESCRITA COMO TABLA.
 *
 * Los tres estados visibles no se diferencian por un matiz: cambian fondo, icono
 * y copy a la vez. Tenerlos en un solo sitio es lo que hace que se puedan leer
 * en paralelo y comprobar contra el contrato sin recorrer el JSX.
 */
const PRESENTACION: Record<
  EstadoDePrueba,
  {
    fondo: string;
    icono: typeof Loader2;
    claseIcono: string;
    titulo: string | null;
    apoyo: string | null;
  }
> = {
  inicial: {
    fondo: '',
    icono: Send,
    claseIcono: '',
    titulo: null,
    apoyo: null,
  },
  esperando: {
    fondo: 'bg-muted',
    icono: Loader2,
    claseIcono: 'animate-spin text-muted-foreground',
    titulo: ESPERANDO_TITULO,
    apoyo: ESPERANDO_APOYO,
  },
  llego: {
    fondo: 'bg-surface-ok',
    icono: CircleCheck,
    claseIcono: 'text-status-ok',
    titulo: LLEGO_TITULO,
    apoyo: null,
  },
  no_llego: {
    fondo: 'bg-surface-warn',
    icono: TriangleAlert,
    claseIcono: 'text-status-warn',
    titulo: NO_LLEGO_TITULO,
    apoyo: NO_LLEGO_APOYO,
  },
  agotado: {
    // Ambar y no otra cosa: §4.2. El aseador no hizo nada mal, y la salida es
    // llamar a su administrador, que es exactamente lo que el apoyo dice.
    fondo: 'bg-surface-warn',
    icono: TriangleAlert,
    claseIcono: 'text-status-warn',
    titulo: AGOTADO_TITULO,
    apoyo: AGOTADO_APOYO,
  },
};
