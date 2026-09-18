'use client';

import { CircleSlash, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { formatFechaBog } from '@/lib/domain/dates';

import { cancelarAseo } from '../_actions';

/**
 * Cancelación de un aseo (ASEO-09, 04-UI-SPEC.md §12.5).
 *
 * ── EL BOTON DE DESCARTE SE LLAMA `Volver`, NUNCA `Cancelar` ──────────────
 * Esto NO es preferencia de estilo y por eso queda escrito acá. En un diálogo
 * cuya acción es "cancelar un aseo", dos botones que digan `Cancelar` y
 * `Cancelar aseo` son una trampa: el que descarta y el que ejecuta se llaman
 * casi igual, están uno al lado del otro, y la operación es irreversible.
 * `Cancelar` es el nombre correcto del botón de descarte en el resto de la
 * aplicación (`DialogoDesactivarApartamento.tsx` lo usa); acá, y solo acá, se
 * cambia por `Volver`.
 *
 * ── NO HAY CAMPO DE MOTIVO ESCRITO, Y NO ES UN OLVIDO (T-04-12) ───────────
 * `cleanings.cancel_reason` es un SLUG de una lista cerrada
 * (`reserva_desaparecida`, `reserva_movida`, `cancelado_por_admin`), escrito
 * literal dentro de las funciones y NUNCA texto libre. Es una regla explícita de
 * la migración 13, líneas 119-133, y su razón es que son columnas que un humano
 * lee en pantalla, traducidas por `copyDeReviewReason()` y `copyDeCancelReason()`
 * a través de un mapa cerrado que jamás devuelve el slug crudo.
 *
 * Un `textarea` acá obligaría a una de dos cosas, las dos malas: violar esa regla
 * metiendo texto libre del admin en una columna de slugs —y de ahí al `payload`
 * de una notificación—, o tirar a la basura lo que el admin acabara de escribir.
 * `cancel_cleaning` pone el slug por dentro y la action no le manda ninguno.
 *
 * ── SIN "DESHACER" ────────────────────────────────────────────────────────
 * `cancelada` es TERMINAL por la guarda de transiciones de la migración 13:
 * reactivar un aseo cancelado no es una operación que exista. Un toast con
 * `Deshacer` prometería una llamada que no hay. Si el aseo tiene que volver, se
 * crea de nuevo, y eso es exactamente lo que dice el cuerpo del diálogo.
 *
 * ── NO HAY ESTADO OPTIMISTA ACA ───────────────────────────────────────────
 * §15.2 deja UN solo caso optimista en toda la fase, y es `Marcar como atendida`
 * del panel de alertas. Esta espera respuesta: `cancel_cleaning` exige
 * `is_managed` y `state in (pendiente, en_curso)`, así que puede fallar.
 */

export interface AseoParaCancelar {
  id: string;
  /** Nombre del apartamento. Solo para el título; no viaja a la base. */
  apartamento: string;
  /** `cleanings.scheduled_date`, día de negocio `'YYYY-MM-DD'`. */
  fecha: string;
}

/**
 * El pie, en su propio componente porque `useFormStatus` lee el estado del
 * `<form>` ANCESTRO.
 *
 * En vuelo, el primario cambia a `Loader2` girando y a `Cancelando…`, y conserva
 * su ancho con `min-w-boton-cancelar-aseo`. Prohibido deshabilitar sin mostrar
 * el spinner (§15.2).
 */
function PieDeCancelar() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogFooter>
      {/*
        `Volver`, NUNCA `Cancelar`. Ver la cabecera de este archivo. `autoFocus`
        va acá y no en el destructivo: un Enter reflejo sobre un diálogo recién
        aparecido no puede borrarle el aseo al aseador.
      */}
      <AlertDialogCancel autoFocus disabled={pending}>
        Volver
      </AlertDialogCancel>

      <AlertDialogAction
        type="submit"
        variant="destructive"
        disabled={pending}
        className="min-w-boton-cancelar-aseo"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Cancelando…
          </>
        ) : (
          <>
            {/* El icono es el segundo canal: el color nunca carga solo la
                información de que esto es lo destructivo (§4.6). */}
            <CircleSlash aria-hidden="true" />
            Cancelar aseo
          </>
        )}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

export function DialogoCancelarAseo({
  aseo,
  abierto,
  onAbiertoChange,
}: {
  aseo: AseoParaCancelar;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const router = useRouter();

  /**
   * EL AVISO SE PUBLICA DENTRO DE LA ACTION, NO EN UN `useEffect`. ESTÁ MEDIDO.
   *
   * ── LO QUE PASABA CUANDO ESTABA EN EL EFECTO (D-09-02-A) ───────────────────
   *
   * Un `router.refresh()` de `SincronizacionEnVivo` aterrizaba mientras la
   * Server Action seguía en vuelo. El árbol que traía ese refresco YA reflejaba
   * la cancelación, y un aseo cancelado sale de `visibles` y se queda plegado
   * detrás de `Ver cancelados` (`BloqueDia.tsx`). O sea que la fila desaparecía
   * del DOM, y con ella se iban `FilaAseo`, `MenuAseo` y este mismo diálogo, que
   * `MenuAseo` monta condicionalmente. Al morir el componente moría su
   * `useActionState`, así que el resultado de la action llegaba a un sitio que ya
   * no existía y **el efecto no corría nunca**. El admin cancelaba, la base
   * escribía, y no se enteraba.
   *
   * Registro del rojo, con el reloj en cero al montar el diálogo:
   *
   *   +549 ms  SUBMIT            (la action arranca)
   *   +587 ms  REFRESH realtime
   *   +760 ms  RENDER tabla []   (el árbol nuevo ya no trae la fila)
   *   +762 ms  DESMONTA          (el diálogo muere)
   *   …y ni `EFECTO ok` ni `TOAST` aparecen jamás.
   *
   * El mismo registro en verde: `EFECTO ok` a +276 ms, `TOAST` a +276 ms,
   * `DESMONTA` a +278 ms. Ganaba la carrera por **dos milisegundos**. Eso es lo
   * que producía el ~32 % de pérdidas, y no la pila de sonner: sonner 2.0.8
   * reproduce su backlog a cada suscriptor nuevo (`Observer.subscribe` llama a
   * `getActiveToasts()`), así que un contenedor que se remonta NO pierde nada.
   *
   * ── POR QUÉ ESTE SITIO SÍ LLEGA, Y EL EFECTO NO ───────────────────────────
   *
   * No es que acá el aviso "sobreviva al desmontaje": es que **se publica antes
   * de que la ventana exista**. Dos medidas lo fijan.
   *
   * 1. `RESULTADO` y `TOAST` comparten marca de tiempo en las ocho corridas
   *    instrumentadas (+606/+606, +597/+597, +504/+505…). La publicación ocurre
   *    en el mismo microtask en que aterriza la respuesta de la action, antes de
   *    que React commitee ningún render. Un `useEffect` llega un commit más
   *    tarde, y ese commit es justo el que puede traer el desmontaje.
   *
   * 2. Mientras la action está en vuelo, React RETIENE el commit del refresco.
   *    Medido metiendo un retraso de 2,5 s dentro de esta función: entran dos
   *    `REFRESH realtime` a +548 ms y +1045 ms, y sin embargo el render que
   *    vacía la tabla no llega hasta +3007 ms, o sea hasta después de que la
   *    action resuelve. La ventana peligrosa es EXACTAMENTE el instante en que
   *    la action resuelve, y es el instante en el que esta línea ya publicó.
   *
   * Y como red de seguridad: `toast` es un singleton de módulo, no un hook, así
   * que publicar tampoco necesita que quede ningún componente vivo. El efecto de
   * abajo se queda SOLO con lo que sí debe morir con el diálogo: cerrarlo.
   *
   * No es un patrón nuevo en el repo: es el que `MenuAseo.marcarRevisado()` y
   * `FilaAlerta` ya usaban, y por eso esos dos nunca perdieron un aviso.
   *
   * **NO devolver esto a un `useEffect`.** Si algún día hace falta tocarlo, la
   * reproducción está en `.planning/phases/09-el-producto-probado-de-punta-a-punta/09-DEBUG-toast.md`.
   */
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    async (previo, datos) => {
      const resultado = await cancelarAseo(previo, datos);

      // `El aseo quedó cancelado.` y nada más: SIN acción de `Deshacer`. Ver la
      // cabecera.
      if (resultado.ok) toast.success(resultado.mensaje);
      // Error de la operación completa: toast destructivo y el diálogo conserva
      // su estado (§15.3).
      else toast.error(resultado.error);

      return resultado;
    },
    null,
  );

  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    // Solo el efecto de interfaz. El aviso ya se publicó arriba.
    if (estado.ok) onAbiertoChange(false);
  }, [estado, onAbiertoChange]);

  function alCambiarApertura(siguiente: boolean) {
    onAbiertoChange(siguiente);
    if (siguiente) return;

    procesado.current = null;
    // La action ya llamó a `revalidatePath('/operacion')`; esto pide el árbol de
    // servidor YA. La fila NO desaparece de la tabla: pasa a `Cancelado`, y el
    // bloque del día la pliega detrás de su toggle `Ver cancelados`.
    router.refresh();
  }

  return (
    <AlertDialog open={abierto} onOpenChange={alCambiarApertura}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar el aseo de {aseo.apartamento}</AlertDialogTitle>
          <AlertDialogDescription>
            El aseo del {formatFechaBog(aseo.fecha)} deja de existir para el aseador.{' '}
            Si tiene que volver, hay que crearlo de nuevo.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* El `<form>` envuelve SOLO el pie para que `AlertDialogContent` siga
            teniendo dos hijos de rejilla y conserve su `gap-4`. Existe porque
            `useFormStatus` necesita un form ancestro.

            Y no lleva ningún campo de motivo: ver la cabecera. */}
        <form action={accion}>
          <input type="hidden" name="aseo_id" value={aseo.id} />
          <PieDeCancelar />
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
