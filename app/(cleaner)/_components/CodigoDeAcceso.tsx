'use client';

import { Copy, Hourglass, KeyRound, Loader2, TriangleAlert } from 'lucide-react';
import { useState, useTransition } from 'react';

import { revelarCodigo } from '@/app/(cleaner)/aseos/[id]/_actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { hoyBog, sumarDias } from '@/lib/domain/dates';

/**
 * EL CODIGO DE LA CERRADURA. LA UNICA SUPERFICIE DEL PROYECTO QUE MUESTRA UN
 * SECRETO AUDITADO (05-UI-SPEC §9.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL CODIGO NUNCA SE PERSISTE EN EL CLIENTE. NI UNA CAPA.
 *
 * Ni almacenamiento local, ni de sesion, ni IndexedDB, ni la cache del service
 * worker, ni ninguna revalidacion de Next. Vive en el estado de React de este
 * componente y MUERE CON EL DESMONTAJE.
 *
 * Es la contrapartida exacta de D-06: el codigo se saco del payload de la
 * notificacion push precisamente para que siguiera saliendo por el RPC que lo
 * audita y lo acota a hoy y manana. Dejarlo cacheado en el telefono anularia esa
 * decision entera y convertiria un secreto efimero en uno guardado, legible por
 * quien tenga el telefono, sin sesion y sin dejar rastro (T-05-44).
 *
 * Y por eso TAMPOCO se cachea "para el aseo de hoy". Que la Fase 6 vuelva esta
 * app offline-first no cambia esta regla: el codigo es la excepcion declarada,
 * escrita en §9.3. Sin conexion, el copy dice que no se puede mostrar; no se
 * inventa una copia local.
 *
 * Dos criterios de aceptacion por grep vigilan esto sobre el archivo, con filtro
 * de comentarios: la regla SI va escrita aqui, las llamadas no.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── UNA VEZ REVELADO, NO SE AUTO-OCULTA ───────────────────────────────────
 *
 * No hay temporizador, no hay cuenta atras y no hay boton de ocultar. El aseador
 * esta DE PIE FRENTE A UNA PUERTA: que el codigo desaparezca solo lo obligaria a
 * pedirlo otra vez, y cada peticion es otra fila en la bitacora de auditoria.
 * Un grep sin filtro de comentarios cuenta cero temporizadores en el archivo,
 * asi que la confirmacion de `Copiado.` tampoco se borra sola. Es correcto: es
 * una linea de texto y no molesta a nadie.
 *
 * ── POR QUE MONO Y POR QUE 28 PIXELES ─────────────────────────────────────
 *
 * §3.2, y es de producto, no estetico: un codigo se lee UNA VEZ y se teclea en
 * un teclado de puerta, con guantes. La ambiguedad entre cero y o mayuscula, o
 * entre uno y ele, en una tipografia sin serifas es un modo de fallo real.
 */

// ── El copy literal de §18.1 y §15.3, en constantes con nombre ───────────────
// Al principio del archivo y no interpolado en el JSX: asi el que compara con el
// contrato lee una lista y no un arbol.

const CTA_REVELAR = 'Ver el código de acceso';
const CTA_REINTENTAR = 'Reintentar';
const CTA_COPIAR = 'Copiar';
const EN_VUELO = 'Abriendo…';
const CONFIRMACION_COPIADO = 'Copiado.';
const ROTULO_CAJA = 'Acceso';

/**
 * NO ES UNA AMENAZA: ES TRANSPARENCIA, Y ES CIERTA. `reveal_access_code()`
 * escribe en la bitacora en la MISMA transaccion, antes de devolver (T-01-48).
 * Esta linea no se puede quitar: es la contrapartida de que el codigo no viaje
 * dentro del aviso.
 */
const AVISO_AUDITORIA = 'Cada vez que lo abres queda registrado.';

/**
 * Fuera de la ventana NO se renderiza un boton deshabilitado. Uno que no explica
 * el porque es peor que ningun boton, y aqui el porque es una REGLA TEMPORAL y
 * no un permiso que falte: el aseo es suyo, simplemente todavia no es su dia.
 */
const FUERA_DE_VENTANA = 'El código se puede ver el día del aseo y el día antes.';

const SIN_CONEXION_TITULO = 'Sin conexión. El código no se puede mostrar ahora.';
const SIN_CONEXION_CUERPO = 'Conéctate y vuelve a tocar.';

const FALLO_AL_COPIAR = 'No se pudo copiar. Selecciónalo y cópialo a mano.';

/**
 * Los cuatro momentos del bloque. Es una union y no un puñado de banderas
 * sueltas para que sea imposible pintar un codigo a la vez que un error: ese
 * codigo seria el de un intento anterior, o sea un secreto mostrado fuera de la
 * unica ruta que lo audita.
 */
type Vista =
  | { fase: 'oculto' }
  | { fase: 'en_vuelo' }
  | { fase: 'error'; titulo: string; cuerpo: string | null }
  | { fase: 'revelado'; codigo: string };

/**
 * Decide, comparando cadenas `'YYYY-MM-DD'`, si el aseo cae en la ventana del
 * RPC: hoy o manana.
 *
 * PROHIBIDO CONSTRUIR UN INSTANTE A PARTIR DE LA FECHA DE NEGOCIO. Una cadena
 * ISO de solo fecha se parsea como medianoche UTC y en Bogota (UTC-5) renderiza
 * el dia ANTERIOR: el boton desapareceria justo el dia del aseo. Regla heredada
 * y escrita en `lib/domain/dates.ts`.
 *
 * ESTA DECISION NO AUTORIZA NADA, y por eso puede vivir en el cliente con el
 * reloj del telefono. La ventana de verdad la impone `reveal_access_code()`
 * contra `public.today_bog()`, o sea contra el reloj de la base. Lo unico que se
 * decide aqui es QUE SE RENDERIZA: un telefono con la fecha corrida veria el
 * boton y recibiria la misma denegacion que cualquier otro.
 */
function dentroDeLaVentana(fechaAseo: string): boolean {
  const hoy = hoyBog();
  return fechaAseo === hoy || fechaAseo === sumarDias(hoy, 1);
}

export function CodigoDeAcceso({
  aseoId,
  fechaAseo,
}: {
  aseoId: string;
  /** El dia de negocio del aseo, `'YYYY-MM-DD'`. Nunca un instante. */
  fechaAseo: string;
}) {
  /**
   * AQUI VIVE EL SECRETO Y EN NINGUN OTRO SITIO. Al desmontarse la pantalla, se
   * va con ella.
   */
  const [vista, setVista] = useState<Vista>({ fase: 'oculto' });
  const [anuncioDeCopia, setAnuncioDeCopia] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  if (!dentroDeLaVentana(fechaAseo)) {
    return (
      <p className="flex items-start gap-sm text-body-movil text-muted-foreground">
        <Hourglass className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
        {FUERA_DE_VENTANA}
      </p>
    );
  }

  function pedirCodigo() {
    /**
     * La conexion se mira ANTES de llamar. Sin esto, el aseador se queda mirando
     * un boton en vuelo hasta que la peticion agota su tiempo y luego recibe un
     * error de red generico que no le dice que hacer.
     *
     * `navigator.onLine` en falso es fiable (no hay interfaz de red); en
     * verdadero no garantiza que haya internet, y ese caso cae por el camino
     * normal de error de abajo.
     */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setVista({ fase: 'error', titulo: SIN_CONEXION_TITULO, cuerpo: SIN_CONEXION_CUERPO });
      return;
    }

    setVista({ fase: 'en_vuelo' });

    iniciar(async () => {
      const datos = new FormData();
      datos.set('aseo', aseoId);

      const r = await revelarCodigo(null, datos);

      if (r.ok) {
        setVista({ fase: 'revelado', codigo: r.codigo });
        return;
      }

      // El mensaje sale de `mapDbError()`, que en `P0001` lee el `hint` de
      // Postgres y no el `message`. El boton se queda y ofrece reintentar.
      setVista({ fase: 'error', titulo: r.error, cuerpo: null });
    });
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setAnuncioDeCopia(CONFIRMACION_COPIADO);
    } catch {
      // Si el portapapeles no esta disponible NO se confirma nada: decirle al
      // aseador que copio algo que no esta ahi es peor que no ofrecer el boton,
      // porque llega a la puerta creyendo que lo tiene.
      setAnuncioDeCopia(FALLO_AL_COPIAR);
    }
  }

  return (
    <div className="flex flex-col gap-md">
      {/*
        El unico uso de `--destructive` que esta fase autoriza (§20.1). Va DENTRO
        de la card y ENCIMA del boton: el aseador lee por que fallo y tiene el
        reintento debajo, sin buscarlo.
      */}
      {vista.fase === 'error' && (
        <Alert variant="destructive">
          <TriangleAlert className="size-5" strokeWidth={2} aria-hidden="true" />
          <AlertTitle className="text-body-movil">{vista.titulo}</AlertTitle>
          {vista.cuerpo !== null && (
            <AlertDescription className="text-micro-movil">{vista.cuerpo}</AlertDescription>
          )}
        </Alert>
      )}

      {vista.fase === 'revelado' ? (
        <div className="flex flex-col items-center gap-md">
          <div className="mx-auto flex w-full max-w-codigo flex-col items-center gap-sm rounded-lg bg-muted p-lg">
            <span className="text-micro-movil font-semibold tracking-wide text-muted-foreground uppercase">
              {ROTULO_CAJA}
            </span>

            {/*
              TEXTO SELECCIONABLE, SIEMPRE. Nunca una imagen, nunca un lienzo y
              nunca la seleccion bloqueada: el aseador tiene que poder marcarlo
              con el dedo si el portapapeles falla.
            */}
            <span className="font-mono text-display-movil font-semibold tracking-codigo text-foreground tabular-nums">
              {vista.codigo}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void copiar(vista.codigo)}
            // 44px, el piso de todo control de este arbol (§16.1). Con guantes o
            // las manos mojadas, un `h-8` de la primitiva es un toque perdido.
            className="min-h-toque w-full max-w-codigo text-body-movil"
          >
            <Copy className="size-5" strokeWidth={2} aria-hidden="true" />
            {CTA_COPIAR}
          </Button>

          {/*
            DOS REGIONES QUE SE ANUNCIAN, Y SON DOS COSAS DISTINTAS (§16.3).

            Esta es la confirmacion de la copia. Existe SIEMPRE, aunque este
            vacia: una region `aria-live` que se monta a la vez que su contenido
            no se anuncia en varios lectores de pantalla.
          */}
          <p aria-live="polite" className="min-h-0 text-micro-movil text-muted-foreground">
            {anuncioDeCopia}
          </p>

          {/*
            Y esta es el DICTADO DEL CODIGO, digito a digito y separado por
            espacios. No es un adorno de accesibilidad: un lector que lea la
            cifra entera dice "cuatrocientos ochenta y dos mil novecientos
            diecisiete", que es literalmente inutilizable frente a un teclado de
            cerradura. Va en `sr-only` porque en pantalla ya esta el codigo.
          */}
          <p aria-live="polite" className="sr-only">
            {vista.codigo.split('').join(' ')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-sm">
          <Button
            type="button"
            disabled={vista.fase === 'en_vuelo'}
            onClick={pedirCodigo}
            // 56px (`--spacing-toque-comodo`, §2.2): es la accion que decide la
            // pantalla. `min-h` y no `h`, para desplazar al `h-8` de la
            // primitiva sin depender del orden del CSS.
            className="min-h-toque-comodo w-full text-body-movil"
          >
            {vista.fase === 'en_vuelo' ? (
              <>
                <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden="true" />
                {EN_VUELO}
              </>
            ) : (
              <>
                <KeyRound className="size-5" strokeWidth={2} aria-hidden="true" />
                {vista.fase === 'error' ? CTA_REINTENTAR : CTA_REVELAR}
              </>
            )}
          </Button>

          <p className="text-micro-movil text-muted-foreground">{AVISO_AUDITORIA}</p>
        </div>
      )}
    </div>
  );
}
