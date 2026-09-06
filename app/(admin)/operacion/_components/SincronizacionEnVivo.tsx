'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { createClient } from '@/lib/supabase/browser';

import { MarcaActualizacion } from './MarcaActualizacion';

/**
 * El tiempo real de `/operacion` y su degradación (D-13, D-15, 04-UI-SPEC.md §13).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA SUSCRIPCIÓN ES UN DISPARADOR, NO UNA FUENTE DE DATOS.
 *
 * Ante cualquier evento se llama `router.refresh()` y **no se lee el payload**.
 * La tentación de "aprovechar el payload ya que llegó" es real, así que las
 * cuatro razones van escritas:
 *
 *   1. El servidor ya sabe derivar todo. Duplicar esa derivación en el cliente es
 *      duplicar `lib/domain/`, y dos verdades sobre el mismo dato se
 *      desincronizan en el primer cambio.
 *   2. El payload de `postgres_changes` trae la fila CRUDA de `cleanings`, **sin
 *      los embeds**. Actualizar estado local dejaría sin resolver el nombre del
 *      apartamento y el del aseador, obligando a una consulta por evento: el N+1
 *      que la consulta con embed de `leerOperacion()` existe para evitar.
 *   3. Ignorar el payload esquiva la necesidad de `REPLICA IDENTITY FULL`, que
 *      sería coste permanente en el WAL de cada UPDATE de la tabla.
 *   4. `router.refresh()` CONSERVA EL ESTADO DEL CLIENTE: qué días están
 *      colapsados, el filtro del panel, el `Sheet` abierto. Es exactamente lo que
 *      un `location.reload()` destruiría.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── EL SONDEO DE RESPALDO NO ES OPCIONAL, Y ES LA CAPA QUE IMPORTA ─────────
 *
 * Es lo que hace que la pantalla siga funcionando con Realtime caído, así que hay
 * que construirlo de todos modos. Con él, Realtime queda como la capa que se
 * puede quitar sin romper nada, que es exactamente el escenario de hoy: el
 * proyecto Supabase hospedado todavía no existe (checkpoint A1 de la Fase 1,
 * abierto) y las cuotas del free tier son documentación leída, no medición
 * propia. Queda anotado como tal.
 *
 * Cuotas del plan Free según la documentación oficial (2026-09-03): 200
 * conexiones concurrentes, 2.000.000 de mensajes al mes, 100 mensajes/s y 100
 * canales por conexión. Un navegador abre UNA conexión WebSocket y multiplexa los
 * canales por dentro, así que un admin consume 1 de 200 conexiones y 1 de 100
 * canales. Cabe con holgura enorme.
 *
 * ── EL ESTADO INICIAL ES DEGRADADO, NO EN VIVO ────────────────────────────
 *
 * Antes del primer `SUBSCRIBED` el canal no está conectado. Arrancar en verde y
 * bajar a ámbar es la mentira silenciosa que D-14 existe para evitar; arrancar en
 * ámbar y subir a verde en 200 ms es honesto y no molesta.
 *
 * **Realtime caído no es un error:** no lleva toast, lleva la línea permanente de
 * §13.2. Un toast se va solo y esto es una condición que dura.
 */

/**
 * DEBOUNCE OBLIGATORIO (T-04-18).
 *
 * Con una ráfaga de quince aseos entrando de golpe, el sync escribe quince filas
 * en UNA transacción y llegan quince eventos, es decir quince `router.refresh()`.
 * Se acumulan durante esta ventana y se refresca una sola vez.
 *
 * **El número es una estimación, no una medición**, y va anotado como tal: si
 * resulta corto, se sube. Es la única complicación real del patrón.
 */
const DEBOUNCE_MS = 400;

/** Revalidación de respaldo con el canal conectado (§13.2). */
const SONDEO_EN_VIVO_MS = 120_000;

/** Sondeo con el canal caído: la pantalla no se puede quedar congelada (§13.2). */
const SONDEO_DEGRADADO_MS = 30_000;

/**
 * Un solo canal para las dos tablas. Las dos ya están publicadas en
 * `supabase_realtime` desde el plan 04-05, y las aserciones 39 y 40 del contrato
 * pgTAP lo comprueban: sin esa publicación el canal se suscribe y no emite nunca,
 * que es el fallo más difícil de diagnosticar de este patrón.
 */
const NOMBRE_DEL_CANAL = 'operacion-admin';

export function SincronizacionEnVivo({ leidoEnMs }: { leidoEnMs: number }) {
  const router = useRouter();
  const [refrescando, startTransition] = useTransition();

  const [enVivo, setEnVivo] = useState(false);
  const [visible, setVisible] = useState(true);

  // `createBrowserClient` cachea un singleton por dentro, así que esto no crea
  // conexiones nuevas; el `useMemo` es para que la identidad no cambie entre
  // renders y no reinicie los efectos de abajo en cada uno.
  const supabase = useMemo(() => createClient(), []);

  /**
   * `startTransition` y no un `router.refresh()` pelado: el `pending` de la
   * transición es lo que hace girar el icono de la cabecera, y dura hasta que
   * llega la carga útil del servidor. Un spinner que se apaga antes de que el
   * dato aterrice miente sobre lo que está pasando.
   */
  const refrescar = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  // ── Visibilidad ──────────────────────────────────────────────────────────
  //
  // Con la pestaña oculta SE PAUSA TODO: ni canal ni sondeo. No es una
  // optimización cosmética. Esta es una pantalla que se deja abierta todo el día,
  // y sondear una pestaña de fondo durante ocho horas es exactamente cómo se
  // quema una cuota gratuita.
  useEffect(() => {
    function alCambiar() {
      setVisible(document.visibilityState === 'visible');
    }

    // Se sincroniza al montar además de escuchar: la pestaña puede estar oculta ya
    // en la primera pasada (una restauración de sesión abre todas las pestañas a
    // la vez), y arrancar asumiendo que se ve sondearía justo lo que se quiere
    // evitar.
    alCambiar();

    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  // Al VOLVER a visible se fuerza una lectura inmediata: la pantalla puede llevar
  // ocho horas sin sondear y lo primero que el admin ve tiene que ser de ahora.
  //
  // El `ref` salta la primera pasada. Sin él, montar la pantalla dispararía un
  // `router.refresh()` inmediato sobre datos que el servidor acaba de entregar.
  const primeraPasada = useRef(true);
  useEffect(() => {
    if (primeraPasada.current) {
      primeraPasada.current = false;
      return;
    }
    if (visible) refrescar();
  }, [visible, refrescar]);

  // ── El canal ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      // Oculta, el canal se cierra y el estado baja a degradado. Al volver, el
      // efecto se vuelve a montar y la línea dice la verdad mientras se
      // resuscribe.
      setEnVivo(false);
      return;
    }

    let temporizador: ReturnType<typeof setTimeout> | null = null;

    function disparar() {
      if (temporizador !== null) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        temporizador = null;
        refrescar();
      }, DEBOUNCE_MS);
    }

    const canal = supabase
      .channel(NOMBRE_DEL_CANAL)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings' }, disparar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, disparar)
      // Los cuatro estados que entrega `subscribe`. Solo uno significa conectado;
      // `CHANNEL_ERROR`, `TIMED_OUT` y `CLOSED` son todos degradación, y no
      // llevan toast: llevan la línea permanente.
      .subscribe((estado) => setEnVivo(estado === 'SUBSCRIBED'));

    return () => {
      if (temporizador !== null) clearTimeout(temporizador);

      /**
       * `removeChannel` EN EL CLEANUP, SIEMPRE.
       *
       * En desarrollo el StrictMode de React 19 monta y desmonta dos veces; sin
       * esto quedan dos canales por montaje y la cuota de canales por conexión se
       * agota en un rato de trabajo con Fast Refresh. No es un problema de
       * producción, es un problema de la máquina de quien programa, y es
       * exactamente el tipo de cosa que se diagnostica mal: se ve como "Realtime
       * dejó de funcionar" y se busca en el sitio equivocado.
       */
      void supabase.removeChannel(canal);
    };
  }, [supabase, visible, refrescar]);

  // ── El sondeo de respaldo ────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    const cada = enVivo ? SONDEO_EN_VIVO_MS : SONDEO_DEGRADADO_MS;
    const intervalo = setInterval(refrescar, cada);
    return () => clearInterval(intervalo);
  }, [visible, enVivo, refrescar]);

  return (
    <MarcaActualizacion
      leidoEnMs={leidoEnMs}
      enVivo={enVivo}
      refrescando={refrescando}
      onRefrescar={refrescar}
    />
  );
}
