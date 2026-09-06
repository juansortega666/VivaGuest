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

  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(cancelarAseo, null);

  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (estado.ok) {
      // `El aseo quedó cancelado.` y nada más: SIN acción de `Deshacer`. Ver la
      // cabecera.
      toast.success(estado.mensaje);
      onAbiertoChange(false);
      return;
    }

    // Error de la operación completa: toast destructivo y el diálogo conserva su
    // estado (§15.3).
    toast.error(estado.error);
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
