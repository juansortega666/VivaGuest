'use client';

import { CalendarCheck, MoreHorizontal, Pencil, Power } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ApartamentoDeLista } from '@/lib/data/apartamentos';
import { estadoDeApartamento } from '@/lib/domain/properties';

import { activarApartamento } from '../_actions';
import { DialogoDesactivarApartamento } from './DialogoDesactivarApartamento';

/**
 * Menu `⋯` de una fila del catalogo (UI-SPEC §7.3).
 *
 * ── LA VISIBILIDAD DE LOS ITEMS SALE DE LA DERIVACION UNICA ─────────────────
 * `Activar` aparece solo sobre una unidad gestionada, apagada y COMPLETA, que es
 * exactamente el estado `inactiva`. `Desactivar` aparece solo sobre `activa`.
 * Reescribir aqui esos `if` con las columnas crudas es como el menu se
 * desincroniza de la columna ESTADO de la misma fila.
 *
 * Sobre una unidad INCOMPLETA el item de activar NO se muestra atenuado: no se
 * muestra. Un item deshabilitado que no dice por que es peor que su ausencia, y
 * el camino real para completarla es `Editar`.
 *
 * Sobre una unidad INFORMATIVA no hay ni `Activar` ni `Desactivar`. No es un
 * pendiente: no cuenta en el banner, no tiene tarifas ni responsable y la base la
 * mantiene inerte por CHECK. Ofrecerle activar seria prometer una operacion que
 * `activarApartamento` rechaza (revalida con `esquemaActivar` antes del update,
 * porque para una informativa NO hay un 23514 que la respalde).
 *
 * ── OCULTAR UN ITEM NO ES AUTORIZAR (T-02-57) ──────────────────────────────
 * Esto es UX. La autorizacion vive en `activarApartamento`, que arranca con
 * `exigirAdmin()`, revalida con Zod y detras tiene los tres CHECK de `properties`.
 * Un Server Action es un endpoint HTTP publico y nadie tiene que abrir este menu
 * para invocarlo.
 *
 * ── COLOR (§4.6) ───────────────────────────────────────────────────────────
 * El disparador destructivo va como TEXTO `--destructive` sobre fondo neutro,
 * nunca relleno, con icono `Power` y separador encima. `variant="destructive"`
 * del item hace exactamente eso.
 */
export function MenuApartamento({ fila }: { fila: ApartamentoDeLista }) {
  const router = useRouter();

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [activando, setActivando] = useState(false);

  const { clave } = estadoDeApartamento(fila);
  const puedeActivar = clave === 'inactiva';
  const puedeDesactivar = clave === 'activa';

  async function activar() {
    setActivando(true);
    try {
      const resultado = await activarApartamento(fila.id);

      if (!resultado.ok) {
        // Si la revalidacion del servidor rechaza la fila, el mensaje dice QUE
        // falta. No se convierte en un "no se pudo": el admin necesita saber a
        // que campo ir.
        toast.error(resultado.error);
        return;
      }

      toast.success(resultado.mensaje);
      router.refresh();
    } finally {
      setActivando(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              // El nombre accesible lleva el nombre del apartamento: con 39 filas,
              // 39 botones llamados "Acciones" son indistinguibles para quien
              // navega por landmarks o por lista de controles.
              aria-label={`Acciones de ${fila.nombre}`}
              className="transicion flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MoreHorizontal className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          }
        />

        <DropdownMenuContent align="end">
          {/* `Editar` — siempre, para las cuatro clases de unidad. */}
          <DropdownMenuItem render={<Link href={`/apartamentos/${fila.id}`} />}>
            <Pencil aria-hidden="true" />
            Editar
          </DropdownMenuItem>

          {/*
            La etiqueta cambia segun haya feed o no, porque las dos operaciones
            son distintas para quien las hace: una conecta algo que no existe y la
            otra reemplaza una credencial que si. El destino es el mismo.
          */}
          <DropdownMenuItem render={<Link href={`/apartamentos/${fila.id}/calendario`} />}>
            <CalendarCheck aria-hidden="true" />
            {fila.tieneCalendario ? 'Cambiar calendario' : 'Conectar calendario'}
          </DropdownMenuItem>

          {puedeActivar && (
            <DropdownMenuItem onClick={activar} disabled={activando}>
              <Power aria-hidden="true" />
              Activar
            </DropdownMenuItem>
          )}

          {puedeDesactivar && (
            <>
              {/*
                El separador de §7.3 SI se pinta aqui, al reves que en el menu de
                aseadores del plan 02-07: alli el item destructivo era el primero
                del menu y el separador habria sido una raya suelta contra el borde
                del popup. Aqui tiene por encima `Editar` y el de calendario, o sea
                algo de lo que separarlo.
              */}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialogoAbierto(true)}
              >
                <Power aria-hidden="true" />
                Desactivar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
        El dialogo vive FUERA del menu: el menu se cierra al pulsar el item, y un
        `AlertDialog` montado dentro del popup se desmontaria con el antes de
        llegar a verse.
      */}
      <DialogoDesactivarApartamento
        apartamento={{ id: fila.id, nombre: fila.nombre }}
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
      />
    </>
  );
}
