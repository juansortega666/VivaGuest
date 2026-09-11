'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { registrarSuscripcion } from '@/app/(cleaner)/_actions';
import { Button } from '@/components/ui/button';
import { base64UrlAUint8, soportaDeclarativo } from '@/lib/push/plataforma';

/**
 * EL UNICO SITIO DE TODO EL PROYECTO QUE PIDE EL PERMISO DE AVISOS.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LAS TRES REGLAS DEL `onClick`, EN ESTE ORDEN, Y NO SON NEGOCIABLES.
 * Apple lo pide literal: *"call the push subscription method immediately from
 * the gesture's event handler code."*
 *
 *   1. `Notification.requestPermission()` DENTRO del handler del click. Nunca al
 *      montar, nunca en un efecto, nunca detras de un temporizador.
 *   2. Acto seguido, EN EL MISMO HANDLER y SIN UN `await` A NUESTRA API EN
 *      MEDIO, `registration.pushManager.subscribe()`.
 *   3. DESPUES, y solo despues, el registro en el servidor.
 *
 * Se escriben aqui arriba porque es el orden que se rompe al "limpiar" el
 * codigo —sacar el `subscribe` a una funcion auxiliar que primero consulta algo
 * nuestro parece una mejora— y su rotura SOLO SE VE EN UN IPHONE: Safari pierde
 * el gesto de usuario y la suscripcion falla en silencio. En el escritorio del
 * desarrollador funciona igual de bien con el orden mal.
 *
 * Y el coste de equivocarse no es un reintento: en iOS **una denegacion es
 * irreversible sin borrar el icono de la pantalla de inicio y reinstalar**
 * (T-05-35). Son ocho personas con un canal unico y sin respaldo.
 *
 * El unico `await` entre 1 y 2 es `navigator.serviceWorker.ready`, que es del
 * navegador y resuelve de inmediato cuando el service worker ya esta activo. No
 * hay ninguna llamada a una action del servidor entre las dos.
 * ════════════════════════════════════════════════════════════════════════════
 */

export function BotonActivarAvisos({
  clavePublica,
  etiqueta,
  reconectar = false,
  alTerminar,
}: {
  /** La clave publica VAPID vigente, en base64url. */
  clavePublica: string;
  /** `Activar los avisos` en S2, `Reconectar los avisos` en S4 (§18.1). */
  etiqueta: string;
  /**
   * S4. Da de baja la suscripcion desalineada ANTES de sacar la nueva.
   *
   * El orden esta medido en el research y no es simetria: resuscribir con otra
   * `applicationServerKey` sin haberse dado de baja lanza `InvalidStateError`
   * en los navegadores basados en Chromium, que es exactamente el caso que S4
   * existe para arreglar.
   */
  reconectar?: boolean;
  /** Le dice al banner que vuelva a medir, y si el intento salio bien. */
  alTerminar: (exito: boolean) => void;
}) {
  const [enVuelo, setEnVuelo] = useState(false);

  async function activar() {
    setEnVuelo(true);
    let exito = false;

    try {
      // ── 1. EL PERMISO, DENTRO DEL HANDLER ──────────────────────────────────
      const permiso = await Notification.requestPermission();

      if (permiso === 'granted') {
        // ── 2. LA SUSCRIPCION, EN EL MISMO HANDLER ───────────────────────────
        const registro = await navigator.serviceWorker.ready;

        if (reconectar) {
          const previa = await registro.pushManager.getSubscription();
          if (previa !== null) await previa.unsubscribe();
        }

        const suscripcion = await registro.pushManager.subscribe({
          // Obligatorio, y iOS lo hace cumplir: una push que no pinta
          // notificacion cuesta la suscripcion entera.
          userVisibleOnly: true,
          applicationServerKey: base64UrlAUint8(clavePublica),
        });

        // ── 3. Y AHORA SI, NUESTRO SERVIDOR ──────────────────────────────────
        const resultado = await registrarSuscripcion(null, aFormDataDeSuscripcion(suscripcion.toJSON()));
        exito = resultado.ok;
      }
    } catch {
      // Se traga a proposito y NO hay toast. Si el permiso quedo concedido y la
      // suscripcion fallo, el estado resultante es S4 y el banner lo dice con el
      // copy de §15.3: el banner ES la superficie de estado, y un toast encima
      // duplicaria la informacion.
      exito = false;
    } finally {
      setEnVuelo(false);
      // Fuera del `try` a proposito: el banner tiene que volver a medir tanto si
      // salio bien como si no. Es lo que lo mueve de S2 a S3 cuando el aseador
      // toca "No permitir".
      alTerminar(exito);
    }
  }

  return (
    <Button
      type="button"
      disabled={enVuelo}
      onClick={() => void activar()}
      // 56px (`--spacing-toque-comodo`, §2.2): el aseador toca esto UNA SOLA VEZ
      // en su vida y esa vez decide su canal. `min-h` y no `h`: desplaza al
      // `h-8` de la primitiva sin depender del orden del CSS.
      className="min-h-toque-comodo w-full text-body-movil"
    >
      {enVuelo ? (
        <>
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Esperando al teléfono…
        </>
      ) : (
        etiqueta
      )}
    </Button>
  );
}

/**
 * El `PushSubscriptionJSON` del navegador, aplanado al `FormData` que espera
 * `registrarSuscripcion`.
 *
 * `soportaDeclarativo()` se evalua aqui y no en el servidor porque es un feature
 * detect DEL NAVEGADOR (D-07): en el servidor no hay nada que detectar.
 */
export function aFormDataDeSuscripcion(suscripcion: PushSubscriptionJSON): FormData {
  const f = new FormData();
  f.set('endpoint', suscripcion.endpoint ?? '');
  f.set('p256dh', suscripcion.keys?.p256dh ?? '');
  f.set('auth', suscripcion.keys?.auth ?? '');
  f.set('soporta_declarativo', soportaDeclarativo() ? 'true' : 'false');
  f.set('user_agent', navigator.userAgent);
  return f;
}
