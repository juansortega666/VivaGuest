'use client';

import { MoreHorizontal, Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { fijarActivacionAseador } from '../_actions';
import { DialogoDesactivarAseador } from './DialogoDesactivarAseador';

/**
 * Menú `⋯` de una fila de la lista de aseadores (UI-SPEC §11.1 y §7.3).
 *
 * El plan 02-07 dejó el disparador montado y vacío para no mover el ancho de las
 * otras cinco columnas al añadirlo después. Aquí se cablea.
 *
 * ── LAS DOS ACCIONES NO SON SIMÉTRICAS, Y ESA ES LA DECISIÓN ────────────────
 *  - `Desactivar` abre un `AlertDialog` con las consecuencias reales: revoca el
 *    acceso de una persona de inmediato.
 *  - `Reactivar` NO pide confirmación y va directo a la action: no revoca nada.
 *    Poner un diálogo ahí sería fricción sin nada que proteger.
 *
 * ── COLOR (UI-SPEC §4.6) ────────────────────────────────────────────────────
 * El disparador destructivo de un menú va como TEXTO `--destructive` sobre fondo
 * neutro, nunca relleno: `--primary` y `--destructive` son ambos rojos y su
 * contraste entre sí es 1.72:1. `variant="destructive"` del ítem hace exactamente
 * eso, y el icono `Power` añade el segundo canal.
 */

export interface AseadorDelMenu {
  id: string;
  full_name: string;
  is_active: boolean;
}

export function MenuAseador({ aseador }: { aseador: AseadorDelMenu }) {
  const router = useRouter();

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [reactivando, setReactivando] = useState(false);

  async function reactivar() {
    setReactivando(true);
    try {
      // LA MISMA función que la baja, con el booleano al revés. No hay una
      // `reactivarAseador` separada a propósito: reactivar son DOS operaciones
      // (`profiles` y el ban de GoTrue) y hacer solo la primera deja al aseador
      // marcado `Activo` en esta misma lista y sin poder entrar. Medido.
      const resultado = await fijarActivacionAseador(aseador.id, true);

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      toast.success(resultado.mensaje);
      router.refresh();
    } finally {
      setReactivando(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Acciones de ${aseador.full_name}`}
              className="transicion flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MoreHorizontal className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          }
        />

        <DropdownMenuContent align="end">
          {aseador.is_active ? (
            /*
              §7.3 pide un separador ENCIMA del ítem destructivo, para despegarlo
              de los ítems normales que lo preceden. En este menú todavía no hay
              ningún ítem por encima (`Editar` de aseador no está en el alcance de
              la fase), y un separador como primer hijo pinta una raya suelta
              contra el borde del popup. Se respeta la intención —separar lo
              destructivo de lo que no lo es— y se añade el separador cuando exista
              algo de lo que separarlo.
            */
            <DropdownMenuItem variant="destructive" onClick={() => setDialogoAbierto(true)}>
              <Power aria-hidden="true" />
              Desactivar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={reactivar} disabled={reactivando}>
              <Power aria-hidden="true" />
              Reactivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
        El diálogo vive FUERA del menú: el menú se cierra al hacer clic en el
        ítem, y un `AlertDialog` montado dentro del popup se desmontaría con él
        antes de llegar a verse.
      */}
      <DialogoDesactivarAseador
        aseador={aseador}
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
      />
    </>
  );
}
