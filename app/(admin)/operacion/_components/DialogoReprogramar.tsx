'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { formatFechaBog } from '@/lib/domain/dates';

import { reprogramarAseo } from '../_actions';

/**
 * Reprogramación de un aseo (ASEO-06, 04-UI-SPEC.md §12.2).
 *
 * ── EL ERROR DE ASEO-07 VA INLINE BAJO EL CAMPO, NUNCA EN TOAST (D-19) ─────
 * `reprogramarAseo` ya devuelve `campo: 'fecha'` con el mensaje interpolado
 * (`Ya hay un aseo activo para {apartamento} el {fecha}. …`), así que este
 * diálogo solo lo pinta bajo el campo que la action nombra, con
 * `aria-describedby` y `aria-invalid`. Es un error atado a un campo concreto y
 * el admin tiene que poder corregir el día sin cerrar el diálogo. Nunca se
 * renderiza `23505` ni el texto crudo de Postgres: eso ya lo resolvió
 * `mapDbError()`.
 *
 * ── LA CONSECUENCIA QUE ALGUIEN VA A REPORTAR COMO BUG, Y NO LO ES ─────────
 * Reprogramar un aseo de `origin = 'ical'` DESANCLA su reserva en la misma
 * sentencia (`reservation_id = null`, migración 15). La siguiente corrida de
 * `sync_feed_apply()` no reconoce ningún aseo para ese checkout y crea uno
 * NUEVO, sin confirmar, en la fecha del checkout real, que cae en la bandeja
 * `Sin confirmar`. O sea: reprogramar produce DOS aseos.
 *
 * Está MEDIDO, no supuesto: el plan 04-07 lo afirmó con dos corridas reales
 * encadenadas de `sync_feed_apply()` en
 * `lib/domain/aseos-admin.integration.test.ts`. La asimetría es deliberada y
 * está declarada en la migración 15: un aseo de MÁS lo revisa un humano y lo
 * cancela en diez segundos; un aseo de MENOS deja a la aseadora en la calle. Si
 * alguna vez el aseo reprogramado apareciera CANCELADO con
 * `cancel_reason = 'reserva_movida'` minutos después de reprogramarlo, esa es la
 * señal de que la RPC dejó de desanclar, y es un defecto grave.
 *
 * ── Y POR QUÉ ESO NO SE ESCRIBE EN LA PANTALLA ────────────────────────────
 * Este comentario es para quien mantenga el código, no para el admin. El aseo
 * que aparece es autoexplicativo donde aparece: la bandeja `Sin confirmar` lleva
 * su propia línea permanente sobre él desde el plan 04-10
 * (`Reprogramar deja acá el aseo de la fecha original, sin confirmar. Si ya no
 * aplica, cancélalo.`). Repetir acá una advertencia sobre el comportamiento
 * interno del motor, en un diálogo de un solo campo, sería ruido justo donde el
 * admin está tomando una decisión de calendario.
 */

export interface AseoParaReprogramar {
  id: string;
  /** Nombre del apartamento. Título y copy; también interpola el error de ASEO-07. */
  apartamento: string;
  /** `cleanings.scheduled_date`, día de negocio `'YYYY-MM-DD'`. */
  fecha: string;
}

/**
 * Botón primario en vuelo (§15.2). Aparte porque `useFormStatus` lee el estado
 * del `<form>` ANCESTRO.
 */
function BotonReprogramar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="min-w-boton-reprogramar">
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Reprogramando…
        </>
      ) : (
        'Reprogramar'
      )}
    </Button>
  );
}

export function DialogoReprogramar({
  aseo,
  hoy,
  abierto,
  onAbiertoChange,
}: {
  aseo: AseoParaReprogramar;
  /**
   * El día de negocio de Bogotá, del SERVIDOR. Llega por prop y no de `hoyBog()`
   * en el cliente: el reloj del navegador puede estar en cualquier zona, y este
   * es el mismo valor con el que la pantalla calculó su ventana. Del lado del
   * servidor lo vuelve a comprobar `today_bog()` dentro de la RPC.
   */
  hoy: string;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const router = useRouter();

  // Controlado: React 19 resetea un `<form action={...}>` no controlado en cuanto
  // la action responde, así que el choque de fecha dejaría el campo en blanco y
  // el admin tendría que volver a teclear el día para corregirlo (§15.3).
  const [fecha, setFecha] = useState('');

  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    reprogramarAseo,
    null,
  );

  const idFecha = useId();
  const idError = useId();

  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (estado.ok) {
      // `El aseo quedó para el {fecha}.`, ya formateado por la action.
      toast.success(estado.mensaje);
      onAbiertoChange(false);
      return;
    }

    // Con `campo` el error ya se pinta inline bajo ese input; duplicarlo en un
    // toast sería decir dos veces lo mismo. Sin `campo` es un error de la
    // operación completa y ahí sí va a toast destructivo (§15.3).
    if (!estado.campo) toast.error(estado.error);
  }, [estado, onAbiertoChange]);

  function alCambiarApertura(siguiente: boolean) {
    onAbiertoChange(siguiente);
    if (siguiente) return;

    setFecha('');
    procesado.current = null;
    // La action ya llamó a `revalidatePath('/operacion')`; esto pide el árbol de
    // servidor YA, para que el aseo aparezca en su día nuevo sin recargar.
    router.refresh();
  }

  // Se extraen a constantes y no a un helper: TypeScript estrecha la unión
  // discriminada a través de un `const` sobre el discriminante, pero NO a través
  // de una función que devuelva booleano.
  const hayError = estado?.ok === false;
  const mensajeError = hayError ? estado.error : '';
  const errorDeFecha = hayError && estado.campo === 'fecha';

  return (
    <Dialog open={abierto} onOpenChange={alCambiarApertura}>
      <DialogContent className="sm:max-w-dialogo">
        <DialogHeader>
          <DialogTitle>Reprogramar el aseo de {aseo.apartamento}</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            Hoy está para el {formatFechaBog(aseo.fecha)}.
          </DialogDescription>
        </DialogHeader>

        <form action={accion} className="flex flex-col gap-lg" noValidate>
          <input type="hidden" name="aseo_id" value={aseo.id} />
          {/* Solo para el copy del error de ASEO-07: permite que el mensaje
              nombre el apartamento sin que `mapDbError()` deje de ser una
              función pura de mapeo. No viaja a la base. */}
          <input type="hidden" name="apartamento_nombre" value={aseo.apartamento} />

          <Field data-invalid={errorDeFecha || undefined}>
            <FieldLabel htmlFor={idFecha}>Fecha nueva</FieldLabel>
            {/* `min` es UX, no autorización: `today_bog()` lo vuelve a comprobar
                dentro de `reschedule_cleaning` y la action lo revalida con Zod. */}
            <Input
              id={idFecha}
              name="fecha"
              type="date"
              required
              min={hoy}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-invalid={errorDeFecha || undefined}
              aria-describedby={errorDeFecha ? idError : undefined}
            />
            {/* AQUÍ, y no en un toast: el mensaje nombra el apartamento y el día,
                y el admin corrige el día sin cerrar el diálogo (D-19, §12.6). */}
            {errorDeFecha && <FieldError id={idError}>{mensajeError}</FieldError>}
          </Field>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" autoFocus>
                  Volver
                </Button>
              }
            />
            <BotonReprogramar />
          </DialogFooter>

          {/* Error de la OPERACIÓN (sin `campo`): va a toast según §15.3, pero
              también queda visible en el diálogo, porque el toast vive fuera del
              foco atrapado y quien navega por teclado no lo encuentra. */}
          {hayError && !errorDeFecha && <FieldError>{mensajeError}</FieldError>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
