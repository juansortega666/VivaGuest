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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AseadorActivo } from '@/lib/data/operacion';
import type { ResultadoAccion } from '@/lib/domain/acciones';

import { reasignarAseo } from '../_actions';
import { AvisoAseadorSinPush } from './AvisoAseadorSinPush';

/**
 * Reasignación de UN aseo (ASEO-04, 04-UI-SPEC.md §12.1).
 *
 * ── LA LÍNEA BAJO EL TÍTULO ES D-18 Y ES LOAD-BEARING ──────────────────────
 * `Cambia quién hace este aseo.`
 * `No cambia el responsable ni el suplente del apartamento.`
 * va FIJA y SIEMPRE VISIBLE. No se recorta, no se mueve a un
 * tooltip, no se convierte en un signo de interrogación y no se muestra solo la
 * primera vez.
 *
 * Es la confusión más fácil de cometer de toda la fase y la más cara de
 * descubrir tarde: un admin que crea que esto cambia el responsable FIJO va a
 * reasignar una vez y a dar por hecho que las próximas semanas quedaron
 * cubiertas. Su contraparte en la base es que `properties.responsable_id` y
 * `properties.suplente_id` NO aparecen en ninguna línea de `reassign_cleaning`
 * (migración 15), con una aserción pgTAP que lo vigila y un señuelo corrido en
 * el plan 04-07 que se puso rojo al intentar tocarlas. El responsable fijo se
 * cambia en la ficha del apartamento, que es otra pantalla.
 *
 * ── EL `Select` NO AUTORIZA NADA (T-04-01) ────────────────────────────────
 * Que liste solo aseadores ACTIVOS es UX: no ofrecer lo que la base va a
 * rechazar. La garantía real es `private.is_admin()` dentro de la RPC más su
 * validación de `role = 'aseador' and is_active`, que levanta
 * `P0001 aseador_invalido`. La FK sola NO lo impide —apunta a `profiles`, donde
 * también viven los admins— y un Server Action es un endpoint HTTP público:
 * quien tenga su id y el payload lo invoca sin abrir este diálogo.
 *
 * ── POR QUÉ EL MENÚ SOLO LO OFRECE SOBRE `Pendiente` ──────────────────────
 * `reassign_cleaning` exige `started_at is null`. Un aseo que ya empezó no se
 * reasigna: dejaría el `started_at` de una persona sobre el nombre de otra. La
 * decisión y su razón viven en `MenuAseo.tsx`, que es quien decide la
 * visibilidad del ítem.
 */

export interface AseoParaReasignar {
  id: string;
  /** Nombre del apartamento. Solo para el título; no viaja a la base. */
  apartamento: string;
  /** `cleanings.aseador_id`. Es quien aparece preseleccionado y marcado `(actual)`. */
  aseadorActualId: string | null;
}

/**
 * Botón primario en vuelo (§15.2). Vive aparte porque `useFormStatus` lee el
 * estado del `<form>` ANCESTRO: llamado desde el componente que renderiza el
 * form devolvería siempre `pending: false`.
 */
function BotonReasignar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="min-w-boton-reasignar">
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Reasignando…
        </>
      ) : (
        'Reasignar'
      )}
    </Button>
  );
}

export function DialogoReasignar({
  aseo,
  aseadores,
  aseadoresSinAvisos,
  abierto,
  onAbiertoChange,
}: {
  aseo: AseoParaReasignar;
  /** Solo aseadores activos, ya ordenados por nombre desde `leerAseadoresActivos()`. */
  aseadores: AseadorActivo[];
  /**
   * Los ids de los aseadores activos que se quedaron sin canal (D-03, §11.3).
   *
   * Viaja como lista de ids y NO como `Set`: cruza la frontera del RSC al
   * cliente, y un `Set` no sobrevive a esa serialización. Son ocho personas, así
   * que la búsqueda lineal cuesta menos que construir el índice.
   */
  aseadoresSinAvisos: string[];
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const router = useRouter();

  /**
   * El actual se preselecciona SOLO si sigue activo.
   *
   * Si lo desactivaron después de asignarle el aseo, la fila sigue mostrando su
   * nombre en A CARGO pero no está en esta lista, y preseleccionar un id que el
   * `Select` no tiene dejaría el disparador en blanco sin decir por qué. Se
   * arranca sin selección y con el placeholder a la vista, que además es
   * exactamente el caso en que reasignar hace más falta.
   */
  const inicial =
    aseo.aseadorActualId && aseadores.some((a) => a.id === aseo.aseadorActualId)
      ? aseo.aseadorActualId
      : null;

  // Controlado, igual que en `DialogoCrearAseo`: React 19 RESETEA un
  // `<form action={...}>` no controlado en cuanto la action responde, y un fallo
  // dejaría el `Select` en blanco (§15.3 exige lo contrario).
  const [aseadorId, setAseadorId] = useState<string | null>(inicial);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    reasignarAseo,
    null,
  );

  const idAseador = useId();
  const idError = useId();

  // `useActionState` conserva el último resultado entre envíos; sin esta marca un
  // re-render volvería a lanzar el toast del mismo éxito.
  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (estado.ok) {
      // `El aseo quedó asignado a {nombre}.` — lo compone la action con el
      // `aseador_nombre` del FormData, y le añade la ausencia de canal cuando la
      // hay. Afirma que el destino se quedó MUDO, nunca que el aviso LLEGÓ: el
      // drenaje es asíncrono y la action no lo sabe (05-UI-SPEC §11.4).
      toast.success(estado.mensaje);
      onAbiertoChange(false);
      // EL REFRESCO VA ACA, Y LA RAZON COMPLETA ESTA EN
      // `DialogoCancelarAseo.tsx`, en este mismo punto: `alCambiarApertura` es el
      // `onOpenChange` del dialogo y NO lo dispara un cierre programatico como el
      // `onAbiertoChange(false)` de la linea de arriba, asi que en el camino feliz
      // el refresco no corria nunca. Medido el 2026-09-29: se reasigna, la base
      // escribe, el toast lo dice, y la tarjeta sigue diciendo el aseador viejo.
      router.refresh();
      return;
    }

    // Un error de la operación completa (RLS, red, 42501, `aseador_invalido`) va
    // a toast destructivo y el diálogo conserva su estado (§15.3).
    toast.error(estado.error);
  }, [estado, onAbiertoChange, router]);

  function alCambiarApertura(siguiente: boolean) {
    onAbiertoChange(siguiente);
    if (siguiente) return;

    setAseadorId(inicial);
    setErrorLocal(null);
    procesado.current = null;
    // La action ya llamó a `revalidatePath('/operacion')`; esto pide el árbol de
    // servidor YA, para que la columna A CARGO cambie sin recargar a mano.
    router.refresh();
  }

  /**
   * Validación de cliente ANTES de enviar, envolviendo la función de
   * `useActionState` en el `action` del form.
   *
   * No se deshabilita el botón: §15.2 prohíbe deshabilitar sin mostrar el
   * spinner, y un primario apagado sin explicación es peor que un mensaje bajo
   * el campo. La base también lo rechazaría (`p_aseador` es `not null`), así que
   * esto solo evita un viaje.
   */
  function enviar(formData: FormData) {
    if (!aseadorId) {
      setErrorLocal('Elige a quién le pasa este aseo.');
      return;
    }
    setErrorLocal(null);
    accion(formData);
  }

  const nombreElegido = aseadores.find((a) => a.id === aseadorId)?.full_name ?? '';

  /**
   * §11.3: la advertencia aparece AL ELEGIR, no antes.
   *
   * Con el `Select` en su placeholder no hay nadie sobre quien advertir, y una
   * línea ámbar colgando de un campo vacío se leería como un problema del
   * diálogo. Por eso la condición incluye que `aseadorId` ya tenga un destino
   * elegido, y no solo que la lista de mudos no esté vacía.
   */
  const destinoMudo = aseadorId !== null && aseadoresSinAvisos.includes(aseadorId);

  return (
    <Dialog open={abierto} onOpenChange={alCambiarApertura}>
      <DialogContent className="sm:max-w-dialogo">
        <DialogHeader>
          <DialogTitle>Reasignar el aseo de {aseo.apartamento}</DialogTitle>

          {/*
            ── D-18, FIJA Y SIEMPRE VISIBLE ────────────────────────────────────
            No borrar, no acortar, no esconder detrás de un tooltip. Ver la
            cabecera de este archivo: es la mitad de producto de una garantía que
            la base cumple por construcción.
          */}
          <DialogDescription className="text-micro text-muted-foreground">
            Cambia quién hace este aseo.{' '}
            No cambia el responsable ni el suplente del apartamento.
          </DialogDescription>
        </DialogHeader>

        <form action={enviar} className="flex flex-col gap-lg" noValidate>
          <input type="hidden" name="aseo_id" value={aseo.id} />
          <input type="hidden" name="aseador_id" value={aseadorId ?? ''} />
          {/* `aseador_nombre` NO viaja a la base: es lo único que permite que el
              mensaje de éxito diga a quién quedó asignado sin que la action
              tenga que ir a buscarlo. Contrato de claves del plan 04-08. */}
          <input type="hidden" name="aseador_nombre" value={nombreElegido} />
          {/* Tampoco viaja a la base. Es lo que permite que el mensaje de éxito
              diga que ese aseador se quedó sin canal: el estado lo conoce el RSC,
              no la action. Ver §11.3 y la cabecera de `../_copy.ts`. */}
          <input
            type="hidden"
            name="aseador_sin_avisos"
            value={destinoMudo ? 'true' : 'false'}
          />

          <Field data-invalid={Boolean(errorLocal) || undefined}>
            <FieldLabel id={`${idAseador}-label`} htmlFor={idAseador}>
              Aseador
            </FieldLabel>

            <Select
              value={aseadorId}
              onValueChange={(v) => setAseadorId(v === null ? null : String(v))}
            >
              <SelectTrigger
                id={idAseador}
                // El nombre accesible se compone de la etiqueta MÁS el valor
                // actual. Solo con la etiqueta, un lector anunciaría "Aseador,
                // botón" sin decir cuál está elegido.
                aria-labelledby={`${idAseador}-label ${idAseador}`}
                aria-invalid={Boolean(errorLocal) || undefined}
                aria-describedby={errorLocal ? idError : undefined}
                className="w-full"
              >
                <SelectValue>
                  {(v: string | null) =>
                    aseadores.find((a) => a.id === v)?.full_name ?? 'Elige un aseador'
                  }
                </SelectValue>
              </SelectTrigger>

              <SelectContent>
                {aseadores.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {/* El `(actual)` va en el texto y no en un color ni un icono:
                        es información, y el color solo nunca la codifica. */}
                    {a.id === aseo.aseadorActualId ? `${a.full_name} (actual)` : a.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {errorLocal && <FieldError id={idError}>{errorLocal}</FieldError>}
          </Field>

          {/* Debajo del selector, y solo con un destino ya elegido. No
              deshabilita `Reasignar` ni cambia su copy: la RPC funciona y el
              aseo queda bien asignado; lo único que no sale es el aviso. */}
          {destinoMudo && <AvisoAseadorSinPush nombre={nombreElegido} />}

          <DialogFooter>
            {/* `Volver` en outline y con `autoFocus`: nunca dos rellenos
                adyacentes (02-UI-SPEC.md §4.6), y un Enter reflejo sobre un
                diálogo recién abierto no puede mover un aseo de manos. */}
            <DialogClose
              render={
                <Button type="button" variant="outline" autoFocus>
                  Volver
                </Button>
              }
            />
            <BotonReasignar />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
