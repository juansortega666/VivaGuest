'use client';

import { Copy, MoreHorizontal, Power } from 'lucide-react';
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

import { fijarActivacionAseador } from '../_actions';
import { DialogoDesactivarAseador } from './DialogoDesactivarAseador';

/**
 * Menú `⋯` de una fila de la lista de aseadores (UI-SPEC §11.1 y §7.3).
 *
 * El plan 02-07 dejó el disparador montado y vacío para no mover el ancho de las
 * otras cinco columnas al añadirlo después. Aquí se cablea.
 *
 * ── `COPIAR EL LINK DE INSTALACIÓN`, Y LO QUE DELIBERADAMENTE NO HACE ───────
 * El ítem copia `https://{dominio}/instalar` al portapapeles. El toast está unas
 * líneas más abajo, literal, y su última frase es la parte que hay que defender:
 * remite al canal que el admin YA usa con esa persona.
 *
 * Es exactamente lo que alguien va a querer "mejorar" añadiendo un botón de
 * enviar: EL PRODUCTO NO TIENE CANAL DE MENSAJERÍA Y NO LO VA A INVENTAR ACÁ. No
 * hay WhatsApp, ni SMS, ni correo saliente. Prometer "enviar el link" cuando no
 * hay a dónde enviarlo sería una acción que miente, y el admin lo descubriría
 * cuando el aseador siguiera sin avisos una semana después.
 *
 * El dominio sale de `window.location.origin` y NO de una variable de entorno
 * nueva: es la misma app, el navegador ya sabe desde qué origen se sirvió, y una
 * variable más es una variable más que se puede quedar desactualizada entre
 * local, preview y producción.
 *
 * El ítem NO aparece para un aseador dado de baja, con la misma condición que
 * los demás: no puede entrar, así que instalarse la app no le sirve de nada.
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

  async function copiarLinkDeInstalacion() {
    // El origen del navegador, no una variable de entorno: es la misma app.
    const link = `${window.location.origin}/instalar`;

    try {
      // `navigator.clipboard` no existe en contexto no seguro (http que no sea
      // localhost). Si falla, NO se dice que se copió: darle por copiado algo que
      // no está en el portapapeles es peor que no ofrecer el ítem.
      await navigator.clipboard.writeText(link);
      toast.success(`Link copiado. Mándaselo por donde ya te hablas con ${aseador.full_name}.`);
    } catch {
      // §18: qué pasó y qué hacer, las dos cosas. Sin disculpas, sin signos de
      // admiración y sin fórmulas vacías de excusa, que no dicen ninguna de las dos.
      toast.error(
        `El navegador no dejó escribir en el portapapeles. Abre ${link} y copia el link de la barra de direcciones.`,
      );
    }
  }

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
            <>
              <DropdownMenuItem onClick={copiarLinkDeInstalacion}>
                <Copy aria-hidden="true" />
                Copiar el link de instalación
              </DropdownMenuItem>

              {/*
                §7.3 pide un separador ENCIMA del ítem destructivo, para despegarlo
                de los ítems normales que lo preceden. El plan 02-07 lo dejó
                pendiente con la razón escrita —un separador como primer hijo pinta
                una raya suelta contra el borde del popup— y con la condición para
                ponerlo: *cuando exista algo de lo que separarlo*. Ya existe.
              */}
              <DropdownMenuSeparator />

              <DropdownMenuItem variant="destructive" onClick={() => setDialogoAbierto(true)}>
                <Power aria-hidden="true" />
                Desactivar
              </DropdownMenuItem>
            </>
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
