'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatHoraBog, tiempoRelativo } from '@/lib/domain/dates';

/**
 * La marca de última actualización de la cabecera (D-14, 04-UI-SPEC.md §13.1).
 *
 * ```
 * Actualizado hace 2 min (14:32)  ⟳
 * ```
 *
 * ── POR QUÉ ESTE COMPONENTE EXISTE ────────────────────────────────────────
 *
 * D-14 existe para evitar una mentira silenciosa concreta: un dashboard que lleva
 * veinticinco minutos sin refrescar y no lo dice. Una pantalla que se actualiza
 * sola tiene que decir CUÁNDO leyó la base, porque si no, todo lo que muestra se
 * lee como "ahora mismo".
 *
 * ── EL `Tooltip` ES OBLIGATORIO Y NO ES UN ADORNO ─────────────────────────
 *
 * Sin él, `Actualizado hace 1 minuto` se lee como "Airbnb está al día hace 1
 * minuto", que es FALSO: el calendario se sincroniza por su cuenta cada 30
 * minutos y esta marca solo habla de la lectura de Postgres. Es exactamente el
 * mismo tipo de mentira silenciosa que D-14 existe para evitar, una capa más
 * abajo.
 *
 * ── UNA SOLA MARCA PARA TODA LA PANTALLA ──────────────────────────────────
 *
 * `leidoEnMs` sale de `leerOperacion()` y baja desde `page.tsx`, que lee el reloj
 * UNA vez. Este componente NO llama `Date.now()` para calcular el instante de la
 * lectura; solo lo llama para saber cuánto tiempo ha pasado DESDE ella, que es
 * otra pregunta.
 *
 * ── EL RELATIVO SE RECALCULA EN CLIENTE, Y LA HIDRATACIÓN LO CONDICIONA ───
 *
 * El primer render —servidor y cliente— usa `leidoEnMs` como "ahora", así que los
 * dos producen `hace 0 s` y no hay desajuste de hidratación. El efecto de abajo
 * es el que empieza a mover el reloj, cada 30 s. Arrancar con `Date.now()` en el
 * estado inicial daría dos textos distintos en las dos pasadas y React lo
 * reportaría como error de hidratación.
 */

/** Cada cuánto se recalcula el relativo. §13.1 lo fija en 30 s. */
const REFRESCO_DEL_RELATIVO_MS = 30_000;

export function MarcaActualizacion({
  leidoEnMs,
  enVivo,
  refrescando,
  onRefrescar,
}: {
  /** El instante de la lectura del servidor. Uno solo para toda la pantalla (D-14). */
  leidoEnMs: number;
  /**
   * `false` mientras el canal de Realtime no haya confirmado su suscripción.
   *
   * EL ESTADO INICIAL ES DEGRADADO, NO EN VIVO. Antes del primer `SUBSCRIBED` el
   * canal no está conectado: arrancar diciendo que sí y bajar a ámbar 200 ms
   * después es la mentira silenciosa; arrancar en ámbar y subir es honesto y no
   * molesta a nadie.
   */
  enVivo: boolean;
  /** Hay un `router.refresh()` en vuelo. El icono gira mientras dure. */
  refrescando: boolean;
  onRefrescar: () => void;
}) {
  const [ahoraMs, setAhoraMs] = useState(leidoEnMs);

  useEffect(() => {
    // La primera pasada del efecto ya corrige el `hace 0 s` del render inicial:
    // entre el instante de la lectura en el servidor y la hidratación pasa el
    // tiempo del viaje, y con un servidor lento eso son segundos de verdad.
    setAhoraMs(Date.now());

    const intervalo = setInterval(() => setAhoraMs(Date.now()), REFRESCO_DEL_RELATIVO_MS);
    return () => clearInterval(intervalo);
  }, [leidoEnMs]);

  const relativo = tiempoRelativo(leidoEnMs, ahoraMs) ?? 'hace un momento';
  const hora = formatHoraBog(leidoEnMs);

  // El texto de las dos situaciones de §13.2, palabra por palabra. El estado
  // degradado se dice CON TEXTO, nunca solo con un icono ni solo con un color:
  // ese es el requisito, no una preferencia.
  const linea = enVivo
    ? `Actualizado ${relativo}${hora ? ` (${hora})` : ''}`
    : `Sin conexión en vivo. Actualizado ${relativo}${hora ? ` (${hora})` : ''}.`;

  return (
    <div className="flex items-center gap-sm">
      {/*
        `aria-live="polite"` (§16.3): el paso a degradado ocurre sin que nadie haya
        tocado nada, y quien usa lector de pantalla no tiene otra forma de
        enterarse de que la pantalla dejó de recibir cambios en vivo.

        `role="status"` va implícito en `aria-live`, pero el contenedor tiene que
        estar montado ANTES de que el texto cambie para que el anuncio se dispare:
        por eso el `div` existe siempre y lo que cambia es su contenido, no su
        presencia.
      */}
      <div
        aria-live="polite"
        className={`flex items-center gap-sm text-micro tabular-nums ${
          enVivo ? 'text-muted-foreground' : 'text-status-warn'
        }`}
      >
        {!enVivo && <WifiOff className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />}

        <Tooltip>
          {/*
            El disparador es un `<span>` y no un botón: la marca no es un control.
            Base UI necesita un elemento que emita eventos de puntero, y un span de
            texto los emite.
          */}
          <TooltipTrigger render={<span className="cursor-default">{linea}</span>} />

          {/* Copy literal de §13.1. No se resume ni se acorta. */}
          <TooltipContent>
            Es la hora en que esta pantalla leyó la base. El calendario de Airbnb se
            sincroniza aparte, cada 30 minutos.
          </TooltipContent>
        </Tooltip>
      </div>

      {/*
        40px de área clicable con un icono de 14px (§13.1). El área es la del
        control, no la del dibujo: 14px de objetivo táctil no lo acierta nadie.

        `animate-spin` es la ÚNICA animación que sobrevive a
        `prefers-reduced-motion` en este repo, y ya viene declarada así en
        `globals.css`. Prohibido deshabilitar sin mostrar el spinner (§15.2): acá
        el botón se deshabilita Y gira.
      */}
      <button
        type="button"
        onClick={onRefrescar}
        disabled={refrescando}
        aria-label="Actualizar ahora"
        className="transicion flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <RefreshCw
          className={`size-3.5 ${refrescando ? 'animate-spin' : ''}`}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
