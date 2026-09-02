'use client';

import { Loader2, Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

import { desactivarApartamento } from '../_actions';

/**
 * Confirmacion de baja de un apartamento (APTO-01, UI-SPEC §15).
 *
 * ── POR QUE HAY CONFIRMACION AQUI Y NO EN `Activar` ─────────────────────────
 * Desactivar corta la generacion de aseos nuevos de una unidad que esta
 * operando. Activar no quita nada. La asimetria es la misma que en la baja de
 * aseadores del plan 02-09: se confirma lo que destruye, no lo que construye.
 *
 * ── EL CUERPO DICE LA CONSECUENCIA EXACTA, NO UNA ADVERTENCIA GENERICA ──────
 * `Deja de generar aseos nuevos. Los aseos ya creados no se tocan.` La segunda
 * frase importa tanto como la primera: sin ella, el admin no sabe si desactivar
 * le borra el trabajo de la semana. Y es cierta por construccion:
 * `desactivarApartamento` solo escribe `properties.is_active` y no toca
 * `cleanings`, cosa que el plan 02-10 fijo con un test de integracion que cuenta
 * antes y despues.
 *
 * ── COLOR (§4.6) ───────────────────────────────────────────────────────────
 * `--primary` y `--destructive` son los dos rojos y su contraste entre si es
 * 1.72:1. Por eso `Cancelar` va `outline` y el UNICO boton relleno del pie es el
 * destructivo, que ademas lleva icono `Power` como segundo canal.
 */

export interface ApartamentoParaBaja {
  id: string;
  nombre: string;
}

export function DialogoDesactivarApartamento({
  apartamento,
  abierto,
  onAbiertoChange,
}: {
  apartamento: ApartamentoParaBaja;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const router = useRouter();
  const [enVuelo, setEnVuelo] = useState(false);

  async function desactivar() {
    setEnVuelo(true);
    try {
      const resultado = await desactivarApartamento(apartamento.id);

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      toast.success(resultado.mensaje);
      onAbiertoChange(false);
      // La action ya llamo a `revalidatePath`; esto pide el arbol de servidor YA
      // para que la fila pase a `Inactiva` sin recargar a mano. La fila NO
      // desaparece de la tabla: cambia de estado.
      router.refresh();
    } finally {
      setEnVuelo(false);
    }
  }

  return (
    <AlertDialog open={abierto} onOpenChange={onAbiertoChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar {apartamento.nombre}</AlertDialogTitle>
          <AlertDialogDescription>
            Deja de generar aseos nuevos. Los aseos ya creados no se tocan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/*
            `autoFocus` en CANCELAR y no en el destructivo: un Enter reflejo sobre
            un dialogo recien aparecido no puede sacar un apartamento de
            circulacion.
          */}
          <AlertDialogCancel autoFocus disabled={enVuelo}>
            Cancelar
          </AlertDialogCancel>

          <AlertDialogAction
            type="button"
            variant="destructive"
            onClick={desactivar}
            disabled={enVuelo}
          >
            {enVuelo ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Desactivando…
              </>
            ) : (
              <>
                <Power aria-hidden="true" />
                Desactivar
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
