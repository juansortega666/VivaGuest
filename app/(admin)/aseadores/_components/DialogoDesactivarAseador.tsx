'use client';

import { Loader2, Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import { apartamentos } from '@/lib/domain/plural';

import {
  consecuenciasDeBaja,
  fijarActivacionAseador,
  type ConsecuenciasDeBaja,
} from '../_actions';

/**
 * Confirmación de baja de un aseador (ASEADOR-02, UI-SPEC §11.3).
 *
 * ── LA REGLA QUE MANDA: LAS CONSECUENCIAS SE CONSULTAN, NO SE ESTIMAN ────────
 * Al abrirse, el diálogo llama a `consecuenciasDeBaja(uid)` y muestra los conteos
 * reales de la base. Escribir un texto genérico del tipo "esto puede afectar a
 * sus apartamentos" sería más fácil y sería inútil: lo que hace consecuente una
 * acción destructiva es enseñar el daño concreto ANTES de ejecutarla.
 *
 * ── LO QUE ESTE DIÁLOGO NO TIENE, Y ES DELIBERADO ───────────────────────────
 *  - SIN confirmación por texto tecleado. Con ~8 aseadores es fricción teatral.
 *  - SIN "Deshacer" en el toast. La reactivación es una operación real que deja
 *    rastro en `profiles.deactivated_at` (T-02-45); esconderla tras un undo de
 *    toast falsearía la auditoría.
 *  - SIN diálogo para reactivar: reactivar no revoca nada. Va directo desde el
 *    menú (ver `MenuAseador`).
 *
 * ── COLOR (UI-SPEC §4.6) ────────────────────────────────────────────────────
 * `--primary` y `--destructive` son los dos rojos y su contraste entre sí es
 * 1.72:1, así que a la carrera no se distinguen. Por eso `Cancelar` va `outline`
 * y el ÚNICO botón relleno del pie es el destructivo. Y lleva icono `Power`
 * además del color, porque el color por sí solo no es un canal.
 */

export interface AseadorParaBaja {
  id: string;
  full_name: string;
}

/** Lo que se está esperando en cada momento, para no pintar conteos a medias. */
type EstadoConsecuencias =
  | { fase: 'cargando' }
  | { fase: 'listo'; datos: ConsecuenciasDeBaja }
  | { fase: 'error'; mensaje: string };

export function DialogoDesactivarAseador({
  aseador,
  abierto,
  onAbiertoChange,
}: {
  aseador: AseadorParaBaja;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const router = useRouter();

  const [consecuencias, setConsecuencias] = useState<EstadoConsecuencias>({
    fase: 'cargando',
  });
  const [enVuelo, setEnVuelo] = useState(false);

  // Los conteos se piden AL ABRIR, no al montar: el menú de cada fila monta este
  // componente, y pedirlos al montar dispararía una consulta por aseador de la
  // tabla en cada render de la página.
  useEffect(() => {
    if (!abierto) return;

    let vigente = true;
    setConsecuencias({ fase: 'cargando' });

    consecuenciasDeBaja(aseador.id)
      .then((datos) => {
        if (vigente) setConsecuencias({ fase: 'listo', datos });
      })
      .catch(() => {
        // NO se cae a "0 apartamentos". Un diálogo que dice "no afecta a nadie"
        // cuando la consulta falló es peor que uno que admite que no pudo
        // calcularlo: el admin desactivaría creyendo que no rompe nada.
        if (vigente) {
          setConsecuencias({
            fase: 'error',
            mensaje: 'No se pudieron calcular las consecuencias de esta baja.',
          });
        }
      });

    return () => {
      vigente = false;
    };
  }, [abierto, aseador.id]);

  async function desactivar() {
    setEnVuelo(true);
    try {
      const resultado = await fijarActivacionAseador(aseador.id, false);

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      toast.success(resultado.mensaje);
      onAbiertoChange(false);
      // La action ya hizo `revalidatePath`; esto fuerza a pedir el árbol de
      // servidor YA, para que la fila pase a `Inactivo` sin recargar a mano.
      // La fila NO desaparece: cambia de estado (§11.1).
      router.refresh();
    } finally {
      setEnVuelo(false);
    }
  }

  const datos = consecuencias.fase === 'listo' ? consecuencias.datos : null;

  return (
    <AlertDialog open={abierto} onOpenChange={onAbiertoChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar a {aseador.full_name}</AlertDialogTitle>
          <AlertDialogDescription>
            Pierde el acceso de inmediato, aunque tenga la sesión abierta en el
            teléfono.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {consecuencias.fase === 'cargando' && (
          <p className="flex items-center gap-sm text-body text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Calculando a cuántos apartamentos afecta…
          </p>
        )}

        {consecuencias.fase === 'error' && (
          <p className="text-body text-destructive">{consecuencias.mensaje}</p>
        )}

        {datos && (
          <ul className="flex list-disc flex-col gap-xs pl-lg text-body text-foreground">
            <li>Es responsable de {apartamentos(datos.responsableDe)}</li>
            <li>Es suplente en {apartamentos(datos.suplenteEn)}</li>
          </ul>
        )}

        {/*
          BLOQUE ÁMBAR SOLO SI HAY APARTAMENTOS ACTIVOS DONDE ES RESPONSABLE.
          El conteo que se muestra es el de ACTIVOS y no el total: un apartamento
          inactivo no genera aseos, así que no "queda sin responsable" en ningún
          sentido que le importe al admin, y sumarlo aquí inflaría el daño.
          Donde el aseador solo es suplente, el responsable sigue en su sitio.
        */}
        {datos && datos.responsableDeActivos > 0 && (
          <p className="rounded-md bg-surface-warn px-md py-sm text-body text-status-warn">
            Esos {apartamentos(datos.responsableDeActivos)} quedan sin responsable.
            Los aseos nuevos no se van a poder confirmar hasta que asignes a otra
            persona.
          </p>
        )}

        <AlertDialogFooter>
          {/*
            `autoFocus` en CANCELAR, no en el destructivo: un Enter reflejo sobre
            un diálogo que acaba de aparecer no puede quitarle el acceso a nadie.
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
