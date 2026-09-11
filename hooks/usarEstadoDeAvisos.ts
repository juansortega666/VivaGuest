'use client';

import { useEffect, useState } from 'react';

import {
  estadoDeAvisos,
  type EntradaEstadoAvisos,
  type EstadoAvisos,
  type PermisoDeAvisos,
} from '@/lib/domain/avisos';
import { base64UrlAUint8, estaInstalada } from '@/lib/push/plataforma';

/**
 * EL UNICO SITIO DONDE LO IMPURO Y LO PURO SE JUNTAN (05-UI-SPEC §5.1 y §15.2).
 *
 * `lib/push/plataforma.ts` lee el navegador, `lib/domain/avisos.ts` decide el
 * estado, y este hook es el que va del uno al otro. Estrena el directorio `hooks/`:
 * es el primero del repo, y existe porque el banner (§7) y el asistente de
 * instalacion (§8) necesitan LA MISMA verdad sobre el estado del telefono, y §5.1
 * dice literal que esa derivacion vive en una sola funcion.
 *
 * ── LAS CUATRO REGLAS, Y CADA UNA ATAJA UN MODO DE FALLO CONCRETO ────────────
 *
 * 1. ESTE HOOK NO PIDE EL PERMISO. NUNCA. Esa llamada vive exclusivamente dentro
 *    del `onClick` de `Activar los avisos` (plan 05-10). Pedirlo al montar lo
 *    quemaria, y en iOS una denegacion es IRREVERSIBLE sin borrar el icono y
 *    reinstalar (T-05-35). Apple lo pide literal: *"call the push subscription
 *    method immediately from the gesture's event handler code."* Hay un criterio de
 *    aceptacion por grep que cuenta cero apariciones fuera de este comentario.
 *
 * 2. SE RECALCULA AL VOLVER A PRIMER PLANO, no solo al montar. El aseador puede
 *    salir a Ajustes, cambiar el permiso y volver. Sin esto, el banner seguiria
 *    diciendo lo que era cierto hace media hora.
 *
 * 3. SE REPARA EN SILENCIO ANTES DE REPORTAR `roto`. Es el sustituto de
 *    `pushsubscriptionchange`, que NO EXISTE EN iOS (MDN BCD:
 *    `ServiceWorkerGlobalScope`, `safari_ios` = `false`). El banner S4 sale solo si
 *    esa reparacion fallo: un banner que sale y desaparece solo ensena a ignorar
 *    los banners.
 *
 * 4. MIENTRAS NO SABE, NO DEVUELVE ESTADO. `null` hasta que la primera medicion
 *    termina, y el banner no se renderiza (§15.2). Un banner que aparece medio
 *    segundo despues de cargar y a veces se cae solo es peor que uno que aparece un
 *    poco tarde.
 */

/**
 * Registra la suscripcion en el servidor. La implementa una Server Action del plan
 * 05-10 y ENTRA POR PARAMETRO: acoplar `hooks/` a una ruta concreta impediria
 * probar este hook, y ademas el asistente de instalacion y el banner la pueden
 * necesitar distinta.
 *
 * `null` significa "este telefono se quedo sin suscripcion", que es lo que hace que
 * el admin lo vea en `Sin avisos` (§5.2).
 */
export type RegistrarSuscripcion = (suscripcion: PushSubscriptionJSON | null) => Promise<void>;

export type OpcionesDeEstadoDeAvisos = {
  /** La clave publica VAPID vigente, en base64url. */
  clavePublica: string;
  /**
   * El `endpoint` que el servidor tiene registrado para este telefono, o `null` si
   * no hay ninguno. Es contra esto que se compara el de la suscripcion viva: una
   * suscripcion que el navegador rehizo por su cuenta es exactamente el caso S4.
   */
  endpointRegistrado: string | null;
  /**
   * Debe ser ESTABLE entre renders. Una Server Action importada del modulo lo es;
   * una funcion escrita en el cuerpo del componente no, y reiniciaria el efecto en
   * cada render.
   */
  registrar: RegistrarSuscripcion;
};

/**
 * Devuelve el estado de los avisos, o `null` mientras todavia no lo sabe.
 *
 * El `null` NO es un estado de carga que haya que pintar: es la ausencia de
 * informacion, y §15.2 dice que ahi no se renderiza nada.
 *
 * ── POR QUE LA FUNCION SE LLAMA `useEstadoDeAvisos` Y EL ARCHIVO NO ──────────
 *
 * El repo escribe en espanol y el archivo conserva ese nombre, pero la FUNCION no
 * puede: `react-hooks/rules-of-hooks` reconoce un hook por el prefijo `use` y nada
 * mas. Con `usarEstadoDeAvisos` la regla falla con `rules-of-hooks` —medido, dos
 * errores de eslint— y, peor que el error, TODAS las reglas de hooks del ecosistema
 * (las dependencias del efecto, el orden de llamada, el compilador de React) dejan
 * de mirar este archivo en silencio. Un nombre en espanol no vale eso.
 */
export function useEstadoDeAvisos(opciones: OpcionesDeEstadoDeAvisos): EstadoAvisos | null {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const { clavePublica, endpointRegistrado, registrar } = opciones;

  useEffect(() => {
    // Se apaga en la limpieza. Sin esto, una medicion en vuelo que termina despues
    // de desmontar escribe estado sobre un componente que ya no existe.
    let montado = true;

    async function recalcular() {
      let siguiente: EstadoAvisos;
      try {
        siguiente = estadoDeAvisos(
          await medirElNavegador({ clavePublica, endpointRegistrado, registrar }),
        );
      } catch {
        // Una medicion que revienta NO produce banner. Deja el estado como estaba
        // —`null` en el primer intento, y por tanto sin renderizar nada— porque
        // inventar un estado a partir de una medicion fallida es como el banner
        // empieza a mentir.
        return;
      }
      if (montado) setEstado(siguiente);
    }

    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible') void recalcular();
    }

    void recalcular();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      montado = false;
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [clavePublica, endpointRegistrado, registrar]);

  return estado;
}

/**
 * Recoge los ocho booleanos que `estadoDeAvisos()` necesita, y de paso intenta la
 * reparacion silenciosa cuando hace falta.
 *
 * Sale por la puerta de atras en cuanto falta algo: sin la maquinaria del navegador
 * no hay `Notification.permission` que leer, y sin el permiso concedido no hay
 * suscripcion que mirar. Preguntar igual seria pedirle al navegador cosas que no
 * tiene.
 */
async function medirElNavegador(
  opciones: OpcionesDeEstadoDeAvisos,
): Promise<EntradaEstadoAvisos> {
  const soportaServiceWorker = 'serviceWorker' in navigator;
  const soportaPushManager = 'PushManager' in window;
  const soportaNotification = 'Notification' in window;

  const base = {
    instalada: estaInstalada(),
    soportaServiceWorker,
    soportaPushManager,
    soportaNotification,
  };

  const sinSuscripcion = {
    haySuscripcion: false,
    endpointCoincide: false,
    reparacionFallida: false,
  };

  if (!soportaServiceWorker || !soportaPushManager || !soportaNotification) {
    // El valor de `permiso` da igual en esta rama: S0 y S1 se deciden antes de
    // mirarlo. Se manda `default` porque es lo que un navegador sin la API
    // significaria, no porque se haya leido nada.
    return { ...base, permiso: 'default', ...sinSuscripcion };
  }

  const permiso = Notification.permission as PermisoDeAvisos;
  if (permiso !== 'granted') {
    return { ...base, permiso, ...sinSuscripcion };
  }

  const registro = await navigator.serviceWorker.ready;
  const actual = await registro.pushManager.getSubscription();

  if (actual !== null && coincideConElRegistrado(actual, opciones.endpointRegistrado)) {
    // Camino sano. Se vuelve a registrar igual, y no es redundante: es lo que
    // refresca `visto_at`, que es de donde sale el `Última vez que abrió la app`
    // del `title` de §5.2.
    await opciones.registrar(actual.toJSON());
    return { ...base, permiso, haySuscripcion: true, endpointCoincide: true, reparacionFallida: false };
  }

  const reparada = await repararEnSilencio(registro, actual, opciones);

  // Tras una reparacion buena, el endpoint COINCIDE por construccion: se acaba de
  // registrar el de la suscripcion nueva en el mismo paso.
  return {
    ...base,
    permiso,
    haySuscripcion: reparada,
    endpointCoincide: reparada,
    reparacionFallida: !reparada,
  };
}

/** Sin endpoint registrado no hay con que comparar, y eso ya es desalineacion. */
function coincideConElRegistrado(
  suscripcion: PushSubscription,
  endpointRegistrado: string | null,
): boolean {
  return endpointRegistrado !== null && suscripcion.endpoint === endpointRegistrado;
}

/**
 * Da de baja la suscripcion desalineada y saca una nueva con la clave vigente.
 *
 * EL ORDEN NO ES NEGOCIABLE Y ESTA MEDIDO EN EL RESEARCH: la baja va PRIMERO.
 * Resuscribir con una `applicationServerKey` distinta sin haberse dado de baja
 * lanza `InvalidStateError` en los navegadores basados en Chromium, que es
 * exactamente el caso que esta funcion existe para arreglar (una rotacion de
 * claves). Hay un criterio de aceptacion que lo comprueba por numero de linea.
 *
 * Devuelve si la reparacion funciono. Cualquier fallo —incluido el del registro en
 * el servidor— es una reparacion fallida, y por tanto el estado `roto` de §5.1: una
 * suscripcion que el servidor no conoce no recibe nada.
 */
async function repararEnSilencio(
  registro: ServiceWorkerRegistration,
  actual: PushSubscription | null,
  { clavePublica, registrar }: OpcionesDeEstadoDeAvisos,
): Promise<boolean> {
  try {
    if (actual !== null) await actual.unsubscribe();

    const nueva = await registro.pushManager.subscribe({
      // Obligatorio, y iOS lo hace cumplir: una push que no pinta notificacion
      // cuesta la suscripcion entera.
      userVisibleOnly: true,
      applicationServerKey: base64UrlAUint8(clavePublica),
    });

    await registrar(nueva.toJSON());
    return true;
  } catch {
    return false;
  }
}
