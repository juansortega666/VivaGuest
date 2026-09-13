'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { formatCOP } from '@/lib/domain/money';

import { marcarPagado } from '../pagos/_actions';

/**
 * `Marcar pagado` (07-UI-SPEC §9.2, §12.2c, §12.3 y §15.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LA ÚLTIMA PANTALLA ANTES DE UNA TRANSFERENCIA REAL.
 *
 * Por eso el nombre y el monto van LITERALES en el cuerpo del diálogo, y no un
 * «¿estás seguro?» genérico. Un genérico delante de una transferencia es
 * exactamente cómo se paga dos veces: quien confirma tiene que ver a quién le
 * está marcando cuánto.
 *
 * ── IRREVERSIBLE NO ES DESTRUCTIVO, Y LA DISTINCIÓN IMPORTA ──────────────
 *
 * Lleva `AlertDialog` porque desde la interfaz no se deshace. Pero **no borra ni
 * revoca nada**, así que el botón de confirmar NO va en la variante destructiva
 * y NO lleva icono de peligro. Esta fase entera no tiene ni una acción
 * destructiva (§15.3): si aparece un rojo aquí, algo se salió del contrato.
 *
 * `Cancelar` va en contorno y solo el de confirmar va relleno. Es la mitigación
 * permanente del choque entre el acento y el color destructivo que el sistema de
 * diseño arrastra desde la Fase 2, y aplica aunque aquí el de confirmar no sea
 * destructivo: nunca dos rellenos adyacentes.
 *
 * ── EL ANCHO SE CONSERVA EN VUELO ────────────────────────────────────────
 *
 * `min-w-boton-marcar` (148px) en los dos botones que cambian de etiqueta.
 * `Marcar pagado` pasa a `Marcando…` y sin el mínimo el botón encogería a mitad
 * de operación, que es la regla que la Fase 4 ya escribió. El giro del icono
 * SIGUE con la preferencia de movimiento reducido: es información de estado, y
 * es la única excepción declarada del contrato de movimiento desde la Fase 2.
 *
 * ── Y LO QUE NO SE PUEDE OLVIDAR: LEER EL RESULTADO ──────────────────────
 *
 * El defecto del 2026-09-11 fue invisible durante semanas porque nadie miraba el
 * `ok`. Aquí el componente comprueba `estado.ok` ANTES de decir nada: con éxito,
 * aviso con el copy exacto y refresco pedido desde el cliente; con fallo, aviso
 * destructivo con el texto ya traducido y **la fila no cambia**. Si el pago ya
 * estaba marcado, porque había dos pestañas abiertas, la action devuelve el copy
 * del contrato y esto lo enseña tal cual.
 *
 * ── EL REFRESCO LO PIDE EL CLIENTE ───────────────────────────────────────
 *
 * `router.refresh()`, y la action NO pide revalidación de ruta: en el árbol de
 * `(admin)` esa llamada cuelga el navegador con la mutación ya escrita. La razón
 * medida está en la cabecera de `../pagos/_actions.ts`.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El pie, en su propio componente porque `useFormStatus` lee el estado del
 * `<form>` ANCESTRO: llamado desde el componente que renderiza el form
 * devolvería siempre `pending: false`.
 */
function PieDeMarcar() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogFooter>
      {/*
        `autoFocus` en `Cancelar` y no en el primario: un Enter reflejo sobre un
        diálogo recién aparecido no puede dejar constancia de una transferencia.
      */}
      <AlertDialogCancel autoFocus disabled={pending}>
        Cancelar
      </AlertDialogCancel>

      <AlertDialogAction type="submit" disabled={pending} className="min-w-boton-marcar">
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Marcando…
          </>
        ) : (
          'Sí, ya le pagué'
        )}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

export function BotonMarcarPagado({
  pagoId,
  aseadora,
  monto,
  fechasPeriodo,
}: {
  pagoId: string;
  /** Nombre copiado en el snapshot. Solo para el copy; no viaja a la base. */
  aseadora: string;
  /** Pesos enteros. Solo para el copy: el monto que se registra lo pone la base. */
  monto: number;
  /** `1 al 30 de enero de 2026`, ya sin el `Del ` inicial. */
  fechasPeriodo: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  const [estado, accion, enVuelo] = useActionState<ResultadoAccion | null, FormData>(
    marcarPagado,
    null,
  );

  // `useActionState` conserva el último resultado entre envíos; sin esta marca un
  // re-render volvería a lanzar el aviso del mismo éxito.
  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (estado.ok) {
      toast.success(estado.mensaje);
      setAbierto(false);
      // La fila pasa a `Pagado el …` y el botón deja de ofrecerse. El servidor ya
      // tiene el dato; esto pide el árbol de servidor YA, sin recargar a mano.
      router.refresh();
      return;
    }

    // La fila NO cambia (§12.3). El texto ya viene en español desde la action,
    // que traduce con `mapDbError()` y sustituye el hint de `pago_ya_marcado`
    // por el copy del contrato.
    toast.error(estado.error);
  }, [estado, router]);

  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(siguiente) => {
        setAbierto(siguiente);
        if (!siguiente) procesado.current = null;
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enVuelo}
            className="min-w-boton-marcar"
          />
        }
      >
        {enVuelo ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Marcando…
          </>
        ) : (
          'Marcar pagado'
        )}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Ya le pagaste a {aseadora}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se registra que le pagaste{' '}
            <span className="tabular-nums">{formatCOP(monto)}</span> del periodo del{' '}
            {fechasPeriodo}, con la fecha de hoy y tu nombre. Esto no se puede deshacer desde
            acá.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* El `<form>` envuelve SOLO el pie para que `AlertDialogContent` siga
            teniendo dos hijos de rejilla y conserve su separación entre la
            cabecera y los botones. Existe porque `useFormStatus` necesita un
            form ancestro. */}
        <form action={accion}>
          <input type="hidden" name="pago_id" value={pagoId} />
          <PieDeMarcar />
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
