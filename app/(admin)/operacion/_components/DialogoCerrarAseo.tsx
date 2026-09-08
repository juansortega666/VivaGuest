'use client';

import { CircleCheck, Loader2 } from 'lucide-react';
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

import { cerrarAseo } from '../_actions';

/**
 * Cierre manual de un aseo (ASEO-08, 04-UI-SPEC.md §12.4).
 *
 * ── `AlertDialog` NO DESTRUCTIVO, Y LA DISTINCION IMPORTA ──────────────────
 * Cerrar no borra nada: deja el aseo como terminado. Lleva `AlertDialog` y no
 * `Dialog` porque es irreversible —`completada` no vuelve a `pendiente` por la
 * guarda de transiciones— pero el primario va en `variant="default"`, no en
 * destructivo. Pintarlo rojo lo igualaría visualmente a cancelar, que es la
 * operación de al lado en el mismo menú y significa lo contrario.
 *
 * ── EL CUERPO DICE LITERALMENTE LO QUE LA OPERACION HACE (T-04-03) ─────────
 * `Queda como terminado, sin checklist y sin fotos.` Esa franqueza no es
 * opcional ni es copy de relleno: `close_cleaning` ES el bypass de
 * `finish_cleaning`, y el admin tiene que saber que está saltándose el checklist
 * por cuarto y la evidencia fotográfica, que son la mitad del producto. Es la
 * mitad de producto de la amenaza T-04-03; la mitad técnica es la guarda de rol
 * dentro de la RPC, cuya mitigación se demostró con el señuelo 2 del plan 04-07.
 *
 * La segunda frase (`Úsalo solo cuando el aseo ya ocurrió por fuera del
 * sistema.`) es la que evita el uso que sí sería un problema: cerrar aseos para
 * limpiar la lista.
 *
 * ── NO HAY ESTADO OPTIMISTA ACA ───────────────────────────────────────────
 * §15.2 deja UN solo caso optimista en toda la fase, y es `Marcar como atendida`
 * del panel de alertas. Esta espera respuesta del servidor: `close_cleaning`
 * exige `is_managed` y `state in (pendiente, en_curso)`, así que puede fallar.
 */

export interface AseoParaCerrar {
  id: string;
  /** Nombre del apartamento. Solo para el título; no viaja a la base. */
  apartamento: string;
}

/**
 * El pie, en su propio componente porque `useFormStatus` lee el estado del
 * `<form>` ANCESTRO: llamado desde el componente que renderiza el form
 * devolvería siempre `pending: false`.
 *
 * En vuelo, el primario cambia a `Loader2` girando y a `Cerrando…`, y conserva
 * su ancho con `min-w-boton-cerrar-aseo`. Prohibido deshabilitar sin mostrar el
 * spinner (§15.2).
 */
function PieDeCerrar() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogFooter>
      {/*
        `autoFocus` en `Volver` y no en el primario: un Enter reflejo sobre un
        diálogo recién aparecido no puede dar por terminado un aseo sin checklist
        ni fotos. Y va en `outline`: nunca dos rellenos adyacentes.
      */}
      <AlertDialogCancel autoFocus disabled={pending}>
        Volver
      </AlertDialogCancel>

      <AlertDialogAction type="submit" disabled={pending} className="min-w-boton-cerrar-aseo">
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Cerrando…
          </>
        ) : (
          <>
            <CircleCheck aria-hidden="true" />
            Cerrar aseo
          </>
        )}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

export function DialogoCerrarAseo({
  aseo,
  abierto,
  onAbiertoChange,
}: {
  aseo: AseoParaCerrar;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const router = useRouter();

  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(cerrarAseo, null);

  // `useActionState` conserva el último resultado entre envíos; sin esta marca un
  // re-render volvería a lanzar el toast del mismo éxito.
  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (estado.ok) {
      toast.success(estado.mensaje);
      onAbiertoChange(false);
      return;
    }

    // Error de la operación completa (RLS, red, 42501, `aseo_no_cerrable`): toast
    // destructivo y el diálogo CONSERVA su estado (§15.3). El texto ya viene en
    // español desde `mapDbError()`, que lee el `hint` de los `P0001`; acá no se
    // interpreta ningún código de Postgres.
    toast.error(estado.error);
  }, [estado, onAbiertoChange]);

  function alCambiarApertura(siguiente: boolean) {
    onAbiertoChange(siguiente);
    if (siguiente) return;

    procesado.current = null;
    // La action ya llamó a `revalidatePath('/operacion')`; esto pide el árbol de
    // servidor YA, para que la fila pase a `Terminado` sin recargar a mano.
    router.refresh();
  }

  return (
    <AlertDialog open={abierto} onOpenChange={alCambiarApertura}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cerrar el aseo de {aseo.apartamento}</AlertDialogTitle>
          <AlertDialogDescription>
            Queda como terminado, sin checklist y sin fotos.{' '}
            Úsalo solo cuando el aseo ya ocurrió por fuera del sistema.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* El `<form>` envuelve SOLO el pie para que `AlertDialogContent` siga
            teniendo dos hijos de rejilla y conserve su `gap-4` entre la cabecera
            y los botones. Existe porque `useFormStatus` necesita un form
            ancestro. */}
        <form action={accion}>
          <input type="hidden" name="aseo_id" value={aseo.id} />
          <PieDeCerrar />
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
