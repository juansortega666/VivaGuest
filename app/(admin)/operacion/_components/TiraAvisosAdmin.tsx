'use client';

import { Bell, BellOff, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { registrarSuscripcion } from '@/app/(cleaner)/_actions';
import { Button } from '@/components/ui/button';
import { useEstadoDeAvisos } from '@/hooks/usarEstadoDeAvisos';
import { aFormDataDeSuscripcion, base64UrlAUint8 } from '@/lib/push/plataforma';

/**
 * LA FRANJA DE PERMISO DEL ADMIN (NOTIF-02, criterio 3, 05-UI-SPEC §13).
 *
 * El criterio 3 exige que el ADMIN tambien reciba avisos, y para eso tiene que
 * conceder permiso y suscribirse. Esta franja es toda la superficie que eso pide.
 *
 * ── ES DELIBERADAMENTE MAS LIVIANA QUE LA DEL ASEADOR (§13.1) ──────────────
 *
 * La asimetria no es descuido: esta anclada en el requisito, que dice literal
 * *"si el ASEADOR no tiene push activo..."*. Para el aseador este es EL canal y
 * su banner es persistente, de seis estados y con paso de prueba; para el admin
 * es una comodidad, porque si no lo activa sigue teniendo el panel de alertas y
 * el tiempo real de la pantalla.
 *
 *   - Descartable POR SESION DE PESTANA, en memoria del cliente. No se guarda en
 *     el almacenamiento persistente del navegador A PROPOSITO: si el admin cierra
 *     y vuelve manana, la franja vuelve. Es una comodidad, no una alarma, pero
 *     tampoco desaparece para siempre.
 *   - NO exige instalacion previa: en escritorio el push funciona en una pestana
 *     normal. Es iOS el que exige la app en la pantalla de inicio, y ese es el
 *     mundo del aseador.
 *   - NO HAY PASO DE PRUEBA. D-02 exige la verificacion para el aseador, cuyo
 *     canal es unico; el admin verifica con el primer reporte real, y si falla
 *     tiene el panel.
 *   - No es sticky, no es modal y no empuja el carril lateral: va dentro del
 *     flujo del carril ancho, asi que el presupuesto de altura cerrado del
 *     lateral (04-UI-SPEC §6.2) no se toca.
 *
 * ── LAS TRES REGLAS DEL PERMISO, QUE SON LAS MISMAS DE §7.3 ────────────────
 *
 *   1. El permiso se pide DENTRO del manejador del click. Nunca al montar, nunca
 *      en un efecto, nunca detras de un temporizador.
 *   2. Acto seguido, EN EL MISMO MANEJADOR y sin un `await` a nuestra API en
 *      medio, `registration.pushManager.subscribe()`.
 *   3. DESPUES, y solo despues, el registro en el servidor.
 *
 * Aqui el coste de equivocarse es menor que en el arbol del aseador —un admin de
 * escritorio puede reabrir el permiso desde el candado de la barra de
 * direcciones—, pero el orden es el mismo porque el codigo se copia y el dia que
 * se copie a un iPhone la denegacion ya no tiene vuelta atras.
 */
export function TiraAvisosAdmin({
  clavePublica,
  endpointRegistrado,
}: {
  /** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, leida en el servidor y bajada como prop. */
  clavePublica: string;
  /** El endpoint que el servidor tiene registrado para este admin, o `null`. */
  endpointRegistrado: string | null;
}) {
  /**
   * Cambiarlo REMONTA la vista y con ella el hook, que vuelve a medir el estado
   * del navegador desde cero. Mismo mecanismo que el banner del aseador: pedir
   * otra medicion sin meter una dependencia artificial en el efecto del hook.
   */
  const [medicion, setMedicion] = useState(0);

  /**
   * El descarte. Vive AQUI, en el componente de fuera, y no dentro de la vista:
   * la remedicion remonta la de dentro, y si viviera ahi se perderia en cada
   * intento de activacion.
   */
  const [oculta, setOculta] = useState(false);

  if (oculta) return null;

  return (
    <Vista
      key={medicion}
      clavePublica={clavePublica}
      endpointRegistrado={endpointRegistrado}
      alOcultar={() => setOculta(true)}
      alTerminar={() => setMedicion((n) => n + 1)}
    />
  );
}

/** Los dos copys de §13.2, literales. */
const COPY_DEFAULT =
  'Activa los avisos en este computador para enterarte de los reportes de campo.';
const COPY_BLOQUEADO =
  'Los avisos están bloqueados en este navegador. Ábrelos desde el candado de la barra de direcciones.';

function Vista({
  clavePublica,
  endpointRegistrado,
  alOcultar,
  alTerminar,
}: {
  clavePublica: string;
  endpointRegistrado: string | null;
  alOcultar: () => void;
  alTerminar: () => void;
}) {
  const [enVuelo, setEnVuelo] = useState(false);

  /**
   * Estable entre renders, que es lo que el hook exige de esta ranura: una
   * funcion escrita en el cuerpo del componente reiniciaria su efecto en cada
   * render. Es lo que refresca la marca de "ultima vez que abrio la app".
   */
  const registrar = useCallback(async (suscripcion: PushSubscriptionJSON | null) => {
    // `null` significa "este navegador se quedo sin suscripcion". La baja la
    // escribe otra action y no este camino; aqui no hay nada que registrar.
    if (suscripcion === null) return;
    await registrarSuscripcion(null, aFormDataDeSuscripcion(suscripcion));
  }, []);

  const estado = useEstadoDeAvisos({ clavePublica, endpointRegistrado, registrar });

  // §15.2: mientras no sabe, no renderiza NADA. Es ademas lo que mantiene el
  // render del servidor libre de cualquier lectura del navegador.
  if (estado === null) return null;

  // Concedido Y suscrito: la franja no se renderiza (§13.2). La union
  // discriminada del dominio hace que en esta rama no haya nada que pintar.
  if (!estado.banner) return null;

  /**
   * Los tres estados de §13.2 salen de los seis del dominio, y los dos que el
   * contrato no nombra se resuelven asi, con la razon escrita:
   *
   *   - `no_soportado` y `sin_instalar`: NO se renderiza. No hay nada que el
   *     admin pueda hacer desde esta franja, y una franja ambar que no ofrece
   *     accion promete uno que no existe (misma regla de §7.6). Ademas ninguno de
   *     los dos es alcanzable en el escritorio desde el que se usa `/operacion`.
   *   - `roto`: se renderiza como `default`, CON boton. El permiso ya esta
   *     concedido pero la suscripcion no sirve, y `Activar` es exactamente lo que
   *     lo arregla: vuelve a pedir el permiso (que contesta de inmediato, sin
   *     prompt), da de baja la suscripcion desalineada y saca una nueva.
   */
  if (estado.clave === 'no_soportado' || estado.clave === 'sin_instalar') return null;

  const bloqueado = estado.clave === 'negado';
  // Lo mismo que hace S4 en el arbol del aseador: la baja va PRIMERO. Resuscribir
  // con otra `applicationServerKey` sin haberse dado de baja lanza
  // `InvalidStateError` en los navegadores basados en Chromium.
  const reconectar = estado.clave === 'roto';

  async function activar() {
    setEnVuelo(true);

    try {
      // ── 1. EL PERMISO, DENTRO DEL MANEJADOR ────────────────────────────────
      const permiso = await Notification.requestPermission();

      if (permiso === 'granted') {
        // ── 2. LA SUSCRIPCION, EN EL MISMO MANEJADOR ─────────────────────────
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
        await registrarSuscripcion(null, aFormDataDeSuscripcion(suscripcion.toJSON()));
      }
    } catch {
      // Se traga a proposito y sin toast: la franja ES la superficie de estado, y
      // la remedicion de abajo la deja diciendo lo que de verdad pasa ahora.
    } finally {
      setEnVuelo(false);
      // Fuera del `try`: hay que volver a medir tanto si salio bien como si el
      // admin toco "Bloquear", que es lo que mueve la franja al estado bloqueado.
      alTerminar();
    }
  }

  const Icono = bloqueado ? BellOff : Bell;

  return (
    <div
      // `region` y no `alert`: es una superficie de estado persistente, no un
      // anuncio puntual, y un `role="alert"` interrumpiria al lector en cada
      // medicion.
      role="region"
      aria-label="Estado de los avisos de este navegador"
      className="flex h-fila items-center gap-md rounded-md bg-surface-warn px-md"
    >
      <Icono className="size-4 shrink-0 text-status-warn" strokeWidth={2} aria-hidden="true" />

      <p className="min-w-0 flex-1 truncate text-body text-foreground">
        {bloqueado ? COPY_BLOQUEADO : COPY_DEFAULT}
      </p>

      {/* Bloqueado NO lleva boton de activar (§13.2): el navegador ya no vuelve a
          preguntar, y un boton que no puede hacer nada es peor que ninguno. */}
      {!bloqueado && (
        <Button
          type="button"
          variant="outline"
          disabled={enVuelo}
          onClick={() => void activar()}
          className="shrink-0"
        >
          {enVuelo ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Activando…
            </>
          ) : (
            'Activar'
          )}
        </Button>
      )}

      {/* 32px de area de toque, la del contrato. El descarte NO toca el
          navegador: solo oculta la franja hasta que se recargue la pestana. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Ocultar"
        onClick={alOcultar}
        className="shrink-0 text-muted-foreground"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
